import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_CHANNEL_MAPPING, AVAILABLE_SWITCH_CODES, detectChannelCount, getDefaultMappingByCount, getAvailableSwitchCodesByCount } from './channel-mapping.constants';
import { decrypt } from '../../common/utils/crypto.util';
import { resolveCredentials } from '../integrations/tuya/tuya-credentials.util';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Device } from './entities/device.entity';
import { TuyaProject } from '../users/entities/tuya-project.entity';
import { AutomationRule } from '../automation/entities/automation-rule.entity';
import { TuyaService } from '../integrations/tuya/tuya.service';
import { EventsGateway } from '../gateway/events.gateway';

const DEVICE_DEPENDENCY_SQL = `
  SELECT id, name, enabled FROM automation_rules
  WHERE user_id = $1
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(actions) = 'array'
           THEN actions
           ELSE jsonb_build_array(actions)
      END
    ) AS action
    WHERE action->>'targetDeviceId' = $2
       OR action->'targetDeviceIds' ? $2
  )
`;

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  private readonly encryptionKey: string;

  constructor(
    @InjectRepository(Device) private devicesRepo: Repository<Device>,
    @InjectRepository(TuyaProject) private tuyaProjectRepo: Repository<TuyaProject>,
    @InjectRepository(AutomationRule) private rulesRepo: Repository<AutomationRule>,
    private tuyaService: TuyaService,
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
  ) {
    this.encryptionKey = this.configService.get('ENCRYPTION_KEY', 'smart-farm-encryption-key-change-me');
  }

  private decryptSecret(encrypted: string): string {
    return decrypt(encrypted, this.encryptionKey);
  }

  async findAllByUser(userId: string) {
    return this.devicesRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async registerBatch(userId: string, devices: { tuyaDeviceId: string; name: string; category: string; deviceType: string; equipmentType?: string; icon?: string; online?: boolean }[], houseId?: string, tuyaProjectId?: string) {
    const results: Device[] = [];

    for (const d of devices) {
      // 이미 등록된 장비인지 확인 (같은 유저 + 같은 Tuya ID)
      const existing = await this.devicesRepo.findOne({
        where: { userId, tuyaDeviceId: d.tuyaDeviceId },
      });

      if (existing) {
        // 기존 장비 업데이트
        existing.name = d.name;
        existing.category = d.category;
        existing.deviceType = d.deviceType as 'sensor' | 'actuator';
        if (d.equipmentType) existing.equipmentType = d.equipmentType as any;
        if (d.icon) existing.icon = d.icon;
        existing.online = d.online ?? existing.online;
        if (d.online) existing.lastSeen = new Date();
        if (houseId) existing.houseId = houseId;
        if (tuyaProjectId) existing.tuyaProjectId = tuyaProjectId;
        results.push(await this.devicesRepo.save(existing));
      } else {
        // 새 장비 등록
        const entity = this.devicesRepo.create({
          userId,
          ...(houseId && { houseId }),
          ...(tuyaProjectId && { tuyaProjectId }),
          tuyaDeviceId: d.tuyaDeviceId,
          name: d.name,
          category: d.category,
          deviceType: d.deviceType as 'sensor' | 'actuator',
          ...(d.equipmentType && { equipmentType: d.equipmentType as any }),
          icon: d.icon,
          online: d.online ?? false,
          ...(d.online && { lastSeen: new Date() }),
        });
        results.push(await this.devicesRepo.save(entity));
      }
    }

    // 개폐기 페어링: opener_open + opener_close 쌍이 있으면 상호 pairedDeviceId 설정
    const openerOpen = results.find(d => d.equipmentType === 'opener_open');
    const openerClose = results.find(d => d.equipmentType === 'opener_close');
    if (openerOpen && openerClose) {
      openerOpen.pairedDeviceId = openerClose.id;
      openerClose.pairedDeviceId = openerOpen.id;
      // openerGroupName 설정 (프론트에서 전달)
      const groupName = devices.find(d => (d as any).openerGroupName)?.['openerGroupName'];
      if (groupName) {
        openerOpen.openerGroupName = groupName;
        openerClose.openerGroupName = groupName;
      }
      await this.devicesRepo.save([openerOpen, openerClose]);
    }

    return results;
  }

  async updateOnlineStatus(tuyaDeviceId: string, online: boolean) {
    await this.devicesRepo.update(
      { tuyaDeviceId },
      { online, lastSeen: new Date() },
    );
  }

  getEffectiveMapping(device: Device, switchCodes?: string[]): Record<string, string> {
    if (device.channelMapping) return device.channelMapping;
    const count = switchCodes ? detectChannelCount(switchCodes) : 8;
    return getDefaultMappingByCount(count);
  }

  async updateChannelMapping(
    deviceId: string,
    userId: string,
    userRole: string,
    mapping: Record<string, string>,
  ): Promise<Device> {
    if (userRole !== 'admin' && userRole !== 'farm_admin') {
      throw new ForbiddenException('구역 매핑 수정 권한이 없습니다.');
    }
    const device = await this.devicesRepo.findOne({ where: { id: deviceId, userId } });
    if (!device) throw new NotFoundException('장비를 찾을 수 없습니다.');
    if (device.equipmentType !== 'irrigation') {
      throw new BadRequestException('관주 장비만 구역 매핑을 설정할 수 있습니다.');
    }
    const count = detectChannelCount(Object.values(mapping));
    const validCodes = new Set(getAvailableSwitchCodesByCount(count));
    for (const [, sw] of Object.entries(mapping)) {
      if (!validCodes.has(sw)) {
        throw new BadRequestException(`유효하지 않은 switch 코드: ${sw}`);
      }
    }
    device.channelMapping = mapping;
    return this.devicesRepo.save(device);
  }

  async controlDevice(id: string, userId: string, commands: { code: string; value: any }[]) {
    const device = await this.devicesRepo.findOne({ where: { id, userId } });
    if (!device) throw new NotFoundException('장비를 찾을 수 없습니다.');

    const credentials = await resolveCredentials(device, this.tuyaProjectRepo, this.decryptSecret.bind(this));

    // 관수 장비의 원격제어 스위치 명령 시 연동 처리
    let finalCommands = commands;
    if (device.equipmentType === 'irrigation') {
      // channelMapping 미저장 시 Tuya 상태로 포트 수 감지 (12포트 B접점 오매핑 방지)
      let switchCodes: string[] = [];
      if (!device.channelMapping) {
        try {
          const statusResult = await this.tuyaService.getDeviceStatus(credentials, device.tuyaDeviceId);
          switchCodes = (statusResult?.result || [])
            .filter((s: any) => typeof s.value === 'boolean' && s.code.startsWith('switch_'))
            .map((s: any) => s.code);
        } catch { /* 상태 조회 실패 시 기본 매핑 사용 */ }
      }
      const mapping = this.getEffectiveMapping(device, switchCodes);
      const remoteControlSwitch = mapping['remote_control'];
      const fertilizerBSwitch = mapping['fertilizer_b_contact'];
      const remoteCmd = commands.find(c => c.code === remoteControlSwitch);

      if (remoteCmd) {
        const extraCommands: { code: string; value: any }[] = [
          { code: fertilizerBSwitch, value: remoteCmd.value },
        ];
        if (remoteCmd.value === false) {
          // 원격제어 OFF: 모든 스위치 강제 OFF
          for (const fn of ['zone_1', 'zone_2', 'zone_3', 'zone_4', 'zone_5', 'zone_6', 'zone_7', 'zone_8', 'mixer', 'fertilizer_motor']) {
            const sw = mapping[fn];
            if (sw) extraCommands.push({ code: sw, value: false });
          }
          // 원격제어 OFF: 해당 장치의 활성 관주 자동화 룰 전체 비활성화
          try {
            const allRules = await this.rulesRepo.find({ where: { userId: device.userId, enabled: true } });
            const toDisable = allRules.filter(r => {
              if ((r.conditions as any)?.type !== 'irrigation') return false;
              const acts = r.actions as any;
              const ids: string[] = [];
              if (acts?.targetDeviceId) ids.push(acts.targetDeviceId);
              if (Array.isArray(acts?.targetDeviceIds)) ids.push(...acts.targetDeviceIds);
              return ids.includes(id);
            });
            if (toDisable.length > 0) {
              for (const r of toDisable) r.enabled = false;
              await this.rulesRepo.save(toDisable);
              this.logger.log(`원격제어 OFF → 관주 룰 ${toDisable.length}개 자동 비활성화: ${device.name}`);
            }
          } catch (err: any) {
            this.logger.warn(`관주 룰 비활성화 실패: ${err.message}`);
          }
        }
        finalCommands = [...commands, ...extraCommands];
        this.logger.log(`관주 원격제어 연동: ${remoteCmd.value ? 'ON' : 'OFF'} → ${JSON.stringify(extraCommands)}`);
      }
    }

    const result = await this.tuyaService.sendDeviceCommand(credentials, device.tuyaDeviceId, finalCommands);
    this.logger.log(`장비 제어: ${device.name} → ${JSON.stringify(finalCommands)}`);
    return { ...result, deviceName: device.name, equipmentType: device.equipmentType };
  }

  async getDeviceStatus(id: string, userId: string) {
    const device = await this.devicesRepo.findOne({ where: { id, userId } });
    if (!device) throw new NotFoundException('장비를 찾을 수 없습니다.');

    const credentials = await resolveCredentials(device, this.tuyaProjectRepo, this.decryptSecret.bind(this));

    try {
      const result = await this.tuyaService.getDeviceStatus(credentials, device.tuyaDeviceId);
      return {
        success: true,
        deviceId: device.id,
        tuyaDeviceId: device.tuyaDeviceId,
        online: device.online,
        status: result.result || [],
      };
    } catch (err: any) {
      return {
        success: false,
        deviceId: device.id,
        online: device.online,
        status: [],
        message: err.message,
      };
    }
  }

  async getDependencies(id: string, userId: string) {
    const device = await this.devicesRepo.findOne({ where: { id, userId } });
    if (!device) throw new NotFoundException();

    const isOpener = device.equipmentType === 'opener_open' || device.equipmentType === 'opener_close';
    const isOpenerPair = isOpener && !!device.pairedDeviceId;

    const automationRules: { id: string; name: string; enabled: boolean }[] =
      await this.devicesRepo.query(DEVICE_DEPENDENCY_SQL, [userId, id]);

    let pairedDevice: Device | null = null;
    let pairedDeviceAutomationRules: { id: string; name: string; enabled: boolean }[] = [];

    if (isOpenerPair) {
      pairedDevice = await this.devicesRepo.findOne({ where: { id: device.pairedDeviceId } });
      if (pairedDevice) {
        pairedDeviceAutomationRules = await this.devicesRepo.query(
          DEVICE_DEPENDENCY_SQL,
          [userId, device.pairedDeviceId],
        );
      }
    }

    // 장비가 속한 그룹 목록 조회
    const groups: { id: string; name: string }[] = await this.devicesRepo.query(
      `SELECT g.id, g.name FROM house_groups g
       INNER JOIN group_devices gd ON gd.group_id = g.id
       WHERE gd.device_id = $1`,
      [id],
    );

    const canDelete = automationRules.length === 0 && pairedDeviceAutomationRules.length === 0 && groups.length === 0;

    return {
      canDelete,
      isOpenerPair,
      pairedDevice: pairedDevice
        ? { id: pairedDevice.id, name: pairedDevice.name, equipmentType: pairedDevice.equipmentType }
        : null,
      automationRules,
      ...(isOpenerPair && { pairedDeviceAutomationRules }),
      groups,
    };
  }

  async removeOpenerPair(id: string, userId: string) {
    const device = await this.devicesRepo.findOne({ where: { id, userId } });
    if (!device) throw new NotFoundException();

    const isOpener = device.equipmentType === 'opener_open' || device.equipmentType === 'opener_close';
    if (!isOpener) throw new BadRequestException('개폐기 장비가 아닙니다.');

    const pairedDevice = device.pairedDeviceId
      ? await this.devicesRepo.findOne({ where: { id: device.pairedDeviceId } })
      : null;

    const ids = [id, pairedDevice?.id].filter(Boolean) as string[];

    // 두 장비 모두 의존성 검사
    const allRules: { id: string; name: string; enabled: boolean }[] = [];
    for (const deviceId of ids) {
      const rules = await this.devicesRepo.query(DEVICE_DEPENDENCY_SQL, [userId, deviceId]);
      allRules.push(...rules);
    }

    if (allRules.length > 0) {
      throw new ConflictException({
        message: '자동 제어 설정에서 사용 중인 장비는 삭제할 수 없습니다.',
        dependencies: { automationRules: allRules },
      });
    }

    // 원자적 삭제
    await this.devicesRepo.query(
      'DELETE FROM group_devices WHERE device_id = ANY($1)',
      [ids],
    );
    await this.devicesRepo.delete({ id: In(ids) });

    return { message: '개폐기 페어가 삭제되었습니다.', deletedIds: ids };
  }

  async renameDevice(id: string, userId: string, name: string) {
    const device = await this.devicesRepo.findOne({ where: { id, userId } });
    if (!device) throw new NotFoundException();
    device.name = name.trim();
    await this.devicesRepo.save(device);
    return { id: device.id, name: device.name };
  }

  async remove(id: string, userId: string) {
    const device = await this.devicesRepo.findOne({ where: { id, userId } });
    if (!device) throw new NotFoundException();

    // 개폐기는 개별 삭제 불가 — opener-pair 엔드포인트 사용
    if (device.equipmentType === 'opener_open' || device.equipmentType === 'opener_close') {
      throw new BadRequestException('개폐기 장비는 /devices/:id/opener-pair 를 통해 쌍으로 삭제해야 합니다.');
    }

    // 자동화 의존성 체크
    const rules: { id: string; name: string; enabled: boolean }[] =
      await this.devicesRepo.query(DEVICE_DEPENDENCY_SQL, [userId, id]);

    if (rules.length > 0) {
      throw new ConflictException({
        message: '자동 제어 설정에서 사용 중인 장비는 삭제할 수 없습니다.',
        dependencies: { automationRules: rules },
      });
    }

    // group_devices 조인 테이블에서 먼저 제거 (외래키 제약 방지)
    await this.devicesRepo.query('DELETE FROM group_devices WHERE device_id = $1', [id]);
    await this.devicesRepo.remove(device);
    return { message: '삭제되었습니다.' };
  }

  /**
   * 20분마다 Tuya Cloud에서 장비 온라인 상태를 동기화
   */
  @Cron('0 */20 * * * *')
  async syncDeviceOnlineStatus() {
    const tuyaProjects = await this.tuyaProjectRepo.find({ where: { enabled: true } });
    for (const project of tuyaProjects) {
      await this.syncDeviceOnlineStatusForUser(project.userId);
    }
  }

  async syncDeviceOnlineStatusForUser(userId: string) {
    const project = await this.tuyaProjectRepo.findOne({
      where: { userId, enabled: true },
      order: { createdAt: 'ASC' },
    });
    if (!project) return;

    try {
      const credentials = {
        accessId: project.accessId,
        accessSecret: this.decryptSecret(project.accessSecretEncrypted),
        endpoint: project.endpoint,
      };

      const result = await this.tuyaService.apiGet(
        credentials,
        '/v1.0/iot-01/associated-users/devices?last_row_key=&size=100',
      );

      if (!result.success || !result.result?.devices) return;

      const tuyaDevices: { id: string; online: boolean }[] = result.result.devices;
      const dbDevices = await this.devicesRepo.find({ where: { userId } });

      for (const dbDevice of dbDevices) {
        const tuyaDevice = tuyaDevices.find(td => td.id === dbDevice.tuyaDeviceId);
        if (!tuyaDevice) continue;

        if (dbDevice.online !== tuyaDevice.online) {
          await this.devicesRepo.update(
            { id: dbDevice.id },
            { online: tuyaDevice.online, lastSeen: new Date() },
          );
          this.eventsGateway.broadcastDeviceStatus(dbDevice.id, tuyaDevice.online);
          this.logger.log(`장비 상태 변경: ${dbDevice.name} → ${tuyaDevice.online ? '온라인' : '오프라인'}`);
        }
      }
    } catch (err) {
      this.logger.error(`장비 상태 동기화 실패 (userId: ${userId}):`, err.message);
    }
  }
}
