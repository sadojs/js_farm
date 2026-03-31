import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationRule } from './entities/automation-rule.entity';
import { AutomationLog } from './entities/automation-log.entity';
import { Device } from '../devices/entities/device.entity';
import { TuyaProject } from '../users/entities/tuya-project.entity';
import { TuyaService } from '../integrations/tuya/tuya.service';
import { EventsGateway } from '../gateway/events.gateway';
import { DEFAULT_CHANNEL_MAPPING } from '../devices/channel-mapping.constants';
import { DevicesService } from '../devices/devices.service';

interface ScheduledAction {
  time: number; // ms offset from start
  type: 'zone_on' | 'zone_off' | 'mixer_on' | 'mixer_off' | 'fertilizer_on' | 'fertilizer_off';
  switchCode: string;
  value: boolean;
  label: string;
}

interface ActiveIrrigation {
  ruleId: string;
  userId: string;
  deviceTuyaId: string;
  startedAt: number;
  timers: ReturnType<typeof setTimeout>[];
}

// zone 번호 → function_key 매핑 (실제 switch 코드는 장비별 channelMapping에서 결정)
const ZONE_FUNCTION_KEY: Record<number, string> = {
  1: 'zone_1',
  2: 'zone_2',
  3: 'zone_3',
  4: 'zone_4',
};

@Injectable()
export class IrrigationSchedulerService {
  private readonly logger = new Logger(IrrigationSchedulerService.name);
  private activeIrrigations = new Map<string, ActiveIrrigation>();

  constructor(
    @InjectRepository(AutomationRule)
    private readonly rulesRepo: Repository<AutomationRule>,
    @InjectRepository(AutomationLog)
    private readonly logsRepo: Repository<AutomationLog>,
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(TuyaProject)
    private readonly tuyaRepo: Repository<TuyaProject>,
    private readonly tuyaService: TuyaService,
    private readonly eventsGateway: EventsGateway,
    private readonly devicesService: DevicesService,
  ) {}

  @Cron('0 * * * * *') // 매분 0초에 실행
  async checkIrrigationRules() {
    const rules = await this.rulesRepo.find({ where: { enabled: true } });
    const now = new Date();

    for (const rule of rules) {
      const conditions = rule.conditions as any;
      if (conditions?.type !== 'irrigation') continue;
      if (this.activeIrrigations.has(rule.id)) continue;

      if (this.shouldStartNow(conditions, now)) {
        this.logger.log(`관수 스케줄 시작: ${rule.name} (${rule.id})`);
        await this.startIrrigation(rule, conditions);
      }
    }
  }

  private shouldStartNow(conditions: any, now: Date): boolean {
    const { startTime, schedule } = conditions;
    if (!startTime || !schedule) return false;

    // 요일 체크 (0=일, 1=월 ... 6=토)
    const currentDay = now.getDay();
    if (!schedule.days.includes(currentDay)) return false;

    // 시간 체크 (HH:mm)
    const [h, m] = startTime.split(':').map(Number);
    if (now.getHours() !== h || now.getMinutes() !== m) return false;

    return true;
  }

  private async startIrrigation(rule: AutomationRule, conditions: any) {
    const actions = rule.actions as any;
    const deviceIds = actions?.targetDeviceIds || (actions?.targetDeviceId ? [actions.targetDeviceId] : []);
    if (deviceIds.length === 0) {
      this.logger.warn(`관수 룰 ${rule.id}: 대상 장비 없음`);
      return;
    }

    const device = await this.devicesRepo.findOne({ where: { id: deviceIds[0] } });
    if (!device) {
      this.logger.warn(`관수 룰 ${rule.id}: 장비 찾을 수 없음`);
      return;
    }

    const credentials = await this.tuyaRepo.findOne({
      where: { userId: rule.userId, enabled: true },
    });
    if (!credentials) {
      this.logger.warn(`관수 룰 ${rule.id}: Tuya 프로젝트 없음`);
      return;
    }

    const tuyaCreds = {
      accessId: credentials.accessId,
      accessSecret: credentials.accessSecretEncrypted,
      endpoint: credentials.endpoint,
    };

    // 장비 채널 매핑 로드
    const mapping = this.devicesService.getEffectiveMapping(device);

    // 원격제어(remote_control) OFF 상태면 스케줄 스킵
    const remoteControlSwitch = mapping['remote_control'];
    try {
      const statusResult = await this.tuyaService.getDeviceStatus(tuyaCreds, device.tuyaDeviceId);
      const remoteControlOn = (statusResult?.result || []).find(
        (s: any) => s.code === remoteControlSwitch,
      )?.value === true;
      if (!remoteControlOn) {
        this.logger.log(`관수 스케줄 스킵: 원격제어(${remoteControlSwitch}) OFF - ${rule.name}`);
        return;
      }
    } catch (err: any) {
      this.logger.warn(`원격제어 상태 확인 실패, 스케줄 진행: ${err.message}`);
    }

    // 타임라인 생성
    const timeline = this.buildTimeline(conditions, mapping);
    this.logger.log(`관수 타임라인 (${timeline.length}개 액션): ${JSON.stringify(timeline.map(a => ({ t: Math.round(a.time / 60000), type: a.type, sw: a.switchCode })))}`);

    // 타이머 등록
    const timers: ReturnType<typeof setTimeout>[] = [];
    const active: ActiveIrrigation = {
      ruleId: rule.id,
      userId: rule.userId,
      deviceTuyaId: device.tuyaDeviceId,
      startedAt: Date.now(),
      timers,
    };
    this.activeIrrigations.set(rule.id, active);

    for (const action of timeline) {
      const timer = setTimeout(async () => {
        try {
          this.logger.log(`관수 실행: ${action.label} (${action.switchCode}=${action.value})`);
          await this.tuyaService.sendDeviceCommand(tuyaCreds, device.tuyaDeviceId, [
            { code: action.switchCode, value: action.value },
          ]);
        } catch (err: any) {
          this.logger.error(`관수 명령 실패: ${action.label} - ${err.message}`);
        }
      }, action.time);
      timers.push(timer);
    }

    // 마지막 액션 이후 정리
    const totalDuration = timeline.length > 0 ? timeline[timeline.length - 1].time + 5000 : 0;
    const cleanupTimer = setTimeout(async () => {
      this.activeIrrigations.delete(rule.id);
      this.logger.log(`관수 완료: ${rule.name}`);

      // 비반복이면 룰 비활성화
      if (!conditions.schedule?.repeat) {
        rule.enabled = false;
        await this.rulesRepo.save(rule);
        this.logger.log(`관수 비반복 룰 비활성화: ${rule.name}`);
      }

      // 로그 기록
      await this.logsRepo.save(
        this.logsRepo.create({
          ruleId: rule.id,
          userId: rule.userId,
          success: true,
          conditionsMet: { type: 'irrigation', startTime: conditions.startTime },
          actionsExecuted: { timeline: timeline.map(a => a.label) },
        }),
      );

      this.eventsGateway.broadcastAutomationExecuted({
        ruleId: rule.id,
        ruleName: rule.name,
        success: true,
        actions: [{ type: 'irrigation_complete' }],
      });
    }, totalDuration);
    timers.push(cleanupTimer);
  }

  private buildTimeline(conditions: any, mapping: Record<string, string>): ScheduledAction[] {
    const actions: ScheduledAction[] = [];
    const zones = (conditions.zones || []).filter((z: any) => z.enabled);
    const fertilizer = conditions.fertilizer || { duration: 0, preStopWait: 0 };

    let offsetMs = 0;

    for (const zone of zones) {
      const zoneDuration = zone.duration * 60000; // ms
      const waitTime = zone.waitTime * 60000;
      const fertDuration = fertilizer.duration * 60000;
      const fertPreStop = fertilizer.preStopWait * 60000;
      const fnKey = ZONE_FUNCTION_KEY[zone.zone];
      if (!fnKey) continue;
      const switchCode = mapping[fnKey];
      if (!switchCode) continue;

      // 구역 ON
      actions.push({
        time: offsetMs,
        type: 'zone_on',
        switchCode,
        value: true,
        label: `${zone.name} ON`,
      });

      // 교반기 ON (관수 시작과 동시 - mixer.enabled 시에만)
      if (conditions.mixer?.enabled && mapping['mixer']) {
        actions.push({
          time: offsetMs,
          type: 'mixer_on',
          switchCode: mapping['mixer'],
          value: true,
          label: `교반기 ON (${zone.name})`,
        });
      }

      // 액비모터 ON/OFF (관수시간 내에 시작 가능한 경우에만)
      if (fertDuration > 0 && mapping['fertilizer_motor']) {
        const fertStartOffset = zoneDuration - fertDuration - fertPreStop;
        const fertEndOffset = zoneDuration - fertPreStop;
        // fertStartOffset > 0 이어야 ON/OFF 모두 유효 (ON 없이 OFF만 발송 방지)
        if (fertStartOffset > 0 && fertEndOffset > 0) {
          actions.push({
            time: offsetMs + fertStartOffset,
            type: 'fertilizer_on',
            switchCode: mapping['fertilizer_motor'],
            value: true,
            label: `액비모터 ON (${zone.name}, ${Math.round(fertStartOffset / 60000)}분 후)`,
          });
          actions.push({
            time: offsetMs + fertEndOffset,
            type: 'fertilizer_off',
            switchCode: mapping['fertilizer_motor'],
            value: false,
            label: `액비모터 OFF (${zone.name}, ${Math.round(fertEndOffset / 60000)}분 후)`,
          });
        }
      }

      // 구역 OFF (관수시간 후)
      actions.push({
        time: offsetMs + zoneDuration,
        type: 'zone_off',
        switchCode,
        value: false,
        label: `${zone.name} OFF`,
      });

      // 교반기 OFF (관수 종료와 동시 - mixer.enabled 시에만)
      if (conditions.mixer?.enabled && mapping['mixer']) {
        actions.push({
          time: offsetMs + zoneDuration,
          type: 'mixer_off',
          switchCode: mapping['mixer'],
          value: false,
          label: `교반기 OFF (${zone.name})`,
        });
      }

      // 다음 구역까지 대기
      offsetMs += zoneDuration + waitTime;
    }

    // 시간순 정렬
    actions.sort((a, b) => a.time - b.time);
    return actions;
  }
}
