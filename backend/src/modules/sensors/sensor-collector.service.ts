import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Device } from '../devices/entities/device.entity';
import { TuyaProject } from '../users/entities/tuya-project.entity';
import { TuyaService } from '../integrations/tuya/tuya.service';
import { SensorsService } from './sensors.service';
import { decryptTuyaSecret } from '../../common/utils/crypto.util';
import { EventsGateway } from '../gateway/events.gateway';

// Tuya 상태 코드 → 센서 타입 매핑
const TUYA_SENSOR_MAP: Record<string, { field: string; unit: string; divisor: number }> = {
  // hjjcy 센서 (내부 온습도)
  va_temperature: { field: 'temperature', unit: '°C', divisor: 10 },
  temp_current: { field: 'temperature', unit: '°C', divisor: 10 },
  va_humidity: { field: 'humidity', unit: '%', divisor: 1 },
  humidity_value: { field: 'humidity', unit: '%', divisor: 1 },
  co2_value: { field: 'co2', unit: 'ppm', divisor: 1 },
  // qxj 센서 (외부 온습도)
  temp_current_external: { field: 'temperature', unit: '°C', divisor: 10 },
  humidity_outdoor: { field: 'humidity', unit: '%', divisor: 1 },
  rain_1h: { field: 'rainfall', unit: 'mm', divisor: 10 },
  uv_index: { field: 'uv', unit: '', divisor: 1 },
  dew_point_temp: { field: 'dew_point', unit: '°C', divisor: 10 },
};

// 저장할 센서 타입만 허용
const ALLOWED_SENSOR_TYPES = new Set([
  'temperature', 'humidity', 'co2',        // hjjcy
  'rainfall', 'uv', 'dew_point',           // qxj
]);

@Injectable()
export class SensorCollectorService {
  private readonly logger = new Logger(SensorCollectorService.name);

  constructor(
    @InjectRepository(Device) private devicesRepo: Repository<Device>,
    @InjectRepository(TuyaProject) private tuyaProjectRepo: Repository<TuyaProject>,
    private tuyaService: TuyaService,
    private sensorsService: SensorsService,
    private eventsGateway: EventsGateway,
  ) {}

  /**
   * 20분마다 온라인 센서의 데이터를 수집하여 TimescaleDB에 저장
   */
  @Cron('0 */20 * * * *')
  async collectSensorData() {
    const tuyaProjects = await this.tuyaProjectRepo.find({ where: { enabled: true } });
    for (const project of tuyaProjects) {
      await this.collectForProject(project);
    }
  }

  async collectForUser(userId: string) {
    const project = await this.tuyaProjectRepo.findOne({
      where: { userId, enabled: true },
      order: { createdAt: 'ASC' },
    });
    if (!project) return;
    await this.collectForProject(project);
  }

  private async collectForProject(project: TuyaProject) {
    try {
      const credentials = {
        accessId: project.accessId,
        accessSecret: decryptTuyaSecret(project.accessSecretEncrypted),
        endpoint: project.endpoint,
      };

      const allSensors = await this.devicesRepo.find({
        where: { userId: project.userId, deviceType: 'sensor', online: true },
      });
      // tuyaProjectId가 지정된 센서는 해당 프로젝트에서만 수집 (중복 방지)
      const sensors = allSensors.filter(
        s => !s.tuyaProjectId || s.tuyaProjectId === project.id,
      );

      for (const sensor of sensors) {
        try {
          const result = await this.tuyaService.getDeviceStatus(credentials, sensor.tuyaDeviceId);
            if (!result.result || !Array.isArray(result.result)) continue;

            for (const status of result.result) {
              const mapping = TUYA_SENSOR_MAP[status.code];
              if (!mapping) continue; // 매핑에 없는 코드는 무시

              // null, undefined, 빈 문자열 → 0으로 변환되는 것 방지
              if (status.value == null || status.value === '') continue;
              const numValue = Number(status.value);
              if (isNaN(numValue)) continue;

              const sensorType = mapping.field;
              const value = numValue / mapping.divisor;
              const unit = mapping.unit;

              // 허용된 센서 타입만 저장
              if (!ALLOWED_SENSOR_TYPES.has(sensorType)) continue;

              await this.sensorsService.storeSensorData({
                deviceId: sensor.id,
                userId: project.userId,
                sensorType,
                value,
                unit,
              });

              // WebSocket으로 실시간 브로드캐스트
              this.eventsGateway.broadcastSensorUpdate({
                deviceId: sensor.id,
                houseId: sensor.houseId,
                sensorType,
                value,
                unit,
                status: 'normal',
                time: new Date().toISOString(),
              });
            }
          } catch (err) {
            this.logger.warn(`측정 데이터 수집 실패 (${sensor.name}): ${err.message}`);
          }
        }

      this.logger.log(`측정 데이터 수집 완료 (userId: ${project.userId}, ${sensors.length}개 측정기)`);
    } catch (err) {
      this.logger.error(`측정 데이터 수집 실패 (userId: ${project.userId}): ${err.message}`);
    }
  }
}
