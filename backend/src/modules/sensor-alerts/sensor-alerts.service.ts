import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SensorAlert } from './entities/sensor-alert.entity';
import { SensorStandby } from './entities/sensor-standby.entity';
import { Device } from '../devices/entities/device.entity';
import {
  SENSOR_ALERT_RULES, AlertRuleParams,
  NO_DATA_WARNING_MINUTES, NO_DATA_CRITICAL_MINUTES,
  FLATLINE_WINDOW_HOURS, ACTION_GUIDES,
} from './sensor-alert-rules';

@Injectable()
export class SensorAlertsService {
  private readonly logger = new Logger(SensorAlertsService.name);

  constructor(
    @InjectRepository(SensorAlert) private alertRepo: Repository<SensorAlert>,
    @InjectRepository(SensorStandby) private standbyRepo: Repository<SensorStandby>,
    @InjectRepository(Device) private deviceRepo: Repository<Device>,
    private dataSource: DataSource,
  ) {}

  // ── 센서 목록 + 대기 관리 ──

  async getSensorsWithStatus(userId: string) {
    const rows: any[] = await this.dataSource.query(`
      SELECT DISTINCT ON (sd.device_id, sd.sensor_type)
        sd.device_id, sd.sensor_type, sd.value, sd.unit, sd.time,
        d.name as device_name,
        CASE WHEN ss.id IS NOT NULL THEN true ELSE false END as standby
      FROM sensor_data sd
      JOIN devices d ON d.id = sd.device_id
      LEFT JOIN sensor_standby ss
        ON ss.device_id = sd.device_id
        AND ss.sensor_type = sd.sensor_type
        AND ss.user_id = $1
      WHERE sd.user_id = $1
      ORDER BY sd.device_id, sd.sensor_type, sd.time DESC
    `, [userId]);

    return rows.map(r => ({
      deviceId: r.device_id,
      deviceName: r.device_name,
      sensorType: r.sensor_type,
      latestValue: r.value != null ? Number(r.value) : null,
      unit: r.unit || '',
      lastSeen: r.time ? new Date(r.time).toISOString() : null,
      standby: r.standby,
    }));
  }

  async addStandby(userId: string, deviceId: string, sensorType: string) {
    const existing = await this.standbyRepo.findOne({
      where: { userId, deviceId, sensorType },
    });
    if (existing) return existing;

    // 해당 센서의 미해결 알림 일괄 해결
    await this.alertRepo.update(
      { deviceId, sensorType, resolved: false },
      { resolved: true, resolvedAt: new Date() },
    );

    const entry = this.standbyRepo.create({ userId, deviceId, sensorType });
    return this.standbyRepo.save(entry);
  }

  async removeStandby(userId: string, deviceId: string, sensorType: string) {
    await this.standbyRepo.delete({ userId, deviceId, sensorType });
    return { success: true };
  }

  // ── 알림 CRUD ──

  async findAll(userId: string, filters: { severity?: string; resolved?: boolean; deviceId?: string }) {
    const qb = this.alertRepo.createQueryBuilder('a')
      .where('a.user_id = :userId', { userId })
      .andWhere('(a.snoozed_until IS NULL OR a.snoozed_until < NOW())')
      // 대기 목록에 있는 센서의 알림 제외
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM sensor_standby ss
        WHERE ss.user_id = a.user_id
          AND ss.device_id = a.device_id
          AND ss.sensor_type = a.sensor_type
      )`)
      .orderBy('a.created_at', 'DESC');

    if (filters.severity) qb.andWhere('a.severity = :severity', { severity: filters.severity });
    if (filters.resolved !== undefined) qb.andWhere('a.resolved = :resolved', { resolved: filters.resolved });
    if (filters.deviceId) qb.andWhere('a.device_id = :deviceId', { deviceId: filters.deviceId });

    return qb.getMany();
  }

  async findOneWithStats(userId: string, id: string) {
    const alert = await this.alertRepo.findOneOrFail({ where: { id, userId } });

    // 24h 통계 조회
    const stats = await this.dataSource.query(`
      SELECT
        MIN(value) as min_value,
        MAX(value) as max_value,
        MAX(value) - MIN(value) as delta,
        (SELECT value FROM sensor_data
         WHERE device_id = $1 AND sensor_type = $2
         ORDER BY time DESC LIMIT 1) as last_value
      FROM sensor_data
      WHERE device_id = $1 AND sensor_type = $2 AND time >= NOW() - INTERVAL '24 hours'
    `, [alert.deviceId, alert.sensorType]);

    return {
      ...alert,
      stats24h: stats[0] || null,
      actionGuides: ACTION_GUIDES[alert.alertType] || [],
    };
  }

  async resolve(userId: string, id: string) {
    await this.alertRepo.update({ id, userId }, { resolved: true, resolvedAt: new Date() });
    return this.alertRepo.findOneOrFail({ where: { id } });
  }

  async remove(userId: string, id: string) {
    await this.alertRepo.delete({ id, userId });
    return { success: true };
  }

  async snooze(userId: string, id: string, days: number) {
    const until = new Date();
    until.setDate(until.getDate() + (days || 1));
    await this.alertRepo.update({ id, userId }, { snoozedUntil: until });
    return this.alertRepo.findOneOrFail({ where: { id } });
  }

  // ── 크론: 이상 감지 ──

  @Cron(CronExpression.EVERY_5_MINUTES)
  async detectAnomalies() {
    const devices = await this.deviceRepo.find({
      where: { deviceType: 'sensor' },
      select: ['id', 'userId', 'name'],
    });

    // 대기 목록 전체 로드 (센서별 체크 시 사용)
    const standbyList = await this.standbyRepo.find();
    const standbySet = new Set(
      standbyList.map(s => `${s.userId}:${s.deviceId}:${s.sensorType}`),
    );

    for (const device of devices) {
      await this.checkDevice(device, standbySet);
    }
  }

  private async checkDevice(
    device: { id: string; userId: string; name: string },
    standbySet: Set<string>,
  ) {
    const latestRows: { sensor_type: string; value: number; time: Date }[] =
      await this.dataSource.query(`
        SELECT DISTINCT ON (sensor_type) sensor_type, value, time
        FROM sensor_data
        WHERE device_id = $1
        ORDER BY sensor_type, time DESC
      `, [device.id]);

    // 장비가 실제로 보고하는 센서 타입만 체크 (없는 타입에 no_data 알림 방지)
    for (const row of latestRows) {
      const sensorType = row.sensor_type;
      const rule = SENSOR_ALERT_RULES[sensorType];
      if (!rule) continue; // 룰이 없는 센서 타입은 건너뛰기

      // 대기 목록에 있는 센서는 건너뛰기
      const key = `${device.userId}:${device.id}:${sensorType}`;
      if (standbySet.has(key)) continue;

      const latest = row;

      // 1) 데이터 없음 체크 (오래된 데이터)
      await this.checkNoData(device, sensorType, latest);

      // 2) 범위 이탈 체크
      await this.checkOutOfRange(device, sensorType, latest, rule);

      // 3) 급변 체크
      await this.checkSpike(device, sensorType, latest, rule);

      // 4) 값 고정 체크
      await this.checkFlatline(device, sensorType, latest, rule);
    }
  }

  // ── 개별 감지 로직 ──

  private async checkNoData(
    device: { id: string; userId: string; name: string },
    sensorType: string,
    latest: { time: Date } | undefined,
  ) {
    if (!latest) {
      await this.createAlertIfNotExists(device, sensorType, 'no_data', 'critical',
        `${sensorType} 데이터 수신 이력 없음`, null, '데이터 없음');
      return;
    }
    const minutesAgo = (Date.now() - new Date(latest.time).getTime()) / 60000;
    if (minutesAgo >= NO_DATA_CRITICAL_MINUTES) {
      await this.createAlertIfNotExists(device, sensorType, 'no_data', 'critical',
        `${Math.round(minutesAgo / 60)}시간 동안 데이터 수신 없음`, null,
        `>${NO_DATA_CRITICAL_MINUTES}분`);
    } else if (minutesAgo >= NO_DATA_WARNING_MINUTES) {
      await this.createAlertIfNotExists(device, sensorType, 'no_data', 'warning',
        `${Math.round(minutesAgo)}분 동안 데이터 수신 없음`, null,
        `>${NO_DATA_WARNING_MINUTES}분`);
    }
  }

  private async checkOutOfRange(
    device: { id: string; userId: string; name: string },
    sensorType: string,
    latest: { value: number },
    rule: AlertRuleParams,
  ) {
    const v = Number(latest.value);
    if (v < rule.min || v > rule.max) {
      const dir = v < rule.min ? '최소' : '최대';
      await this.createAlertIfNotExists(device, sensorType, 'out_of_range', 'critical',
        `${sensorType} 값 ${v}${rule.unit} — 물리적 ${dir} 범위(${rule.min}~${rule.max}) 이탈`,
        v, `${rule.min}~${rule.max}${rule.unit}`);
    }
  }

  private async checkSpike(
    device: { id: string; userId: string; name: string },
    sensorType: string,
    latest: { value: number },
    rule: AlertRuleParams,
  ) {
    const prev = await this.dataSource.query(`
      SELECT value FROM sensor_data
      WHERE device_id = $1 AND sensor_type = $2
        AND time BETWEEN NOW() - INTERVAL '15 minutes' AND NOW() - INTERVAL '5 minutes'
      ORDER BY time DESC LIMIT 1
    `, [device.id, sensorType]);

    if (prev.length === 0) return;
    const delta = Math.abs(Number(latest.value) - Number(prev[0].value));
    if (delta > rule.spikeThreshold) {
      await this.createAlertIfNotExists(device, sensorType, 'spike', 'warning',
        `${sensorType} 10분 내 ${delta.toFixed(1)}${rule.unit} 급변 (임계: ${rule.spikeThreshold}${rule.unit})`,
        Number(latest.value), `>${rule.spikeThreshold}${rule.unit}/10분`);
    }
  }

  private async checkFlatline(
    device: { id: string; userId: string; name: string },
    sensorType: string,
    latest: { value: number },
    rule: AlertRuleParams,
  ) {
    const old = await this.dataSource.query(`
      SELECT value FROM sensor_data
      WHERE device_id = $1 AND sensor_type = $2
        AND time BETWEEN NOW() - INTERVAL '${FLATLINE_WINDOW_HOURS + 2} hours'
                      AND NOW() - INTERVAL '${FLATLINE_WINDOW_HOURS - 2} hours'
      ORDER BY time DESC LIMIT 1
    `, [device.id, sensorType]);

    if (old.length === 0) return;
    const delta = Math.abs(Number(latest.value) - Number(old[0].value));
    if (delta < rule.epsilon) {
      await this.createAlertIfNotExists(device, sensorType, 'flatline', 'warning',
        `${sensorType} ${FLATLINE_WINDOW_HOURS}시간 동안 변화량 ${delta.toFixed(2)}${rule.unit} (임계: ${rule.epsilon}${rule.unit})`,
        Number(latest.value), `변화<${rule.epsilon}${rule.unit}/${FLATLINE_WINDOW_HOURS}h`);
    }
  }

  // ── 중복 방지 ──

  private async createAlertIfNotExists(
    device: { id: string; userId: string; name: string },
    sensorType: string,
    alertType: string,
    severity: string,
    message: string,
    value: number | null,
    threshold: string,
  ) {
    const existing = await this.alertRepo.findOne({
      where: {
        deviceId: device.id,
        sensorType,
        alertType: alertType as any,
        resolved: false,
      },
    });
    if (existing) return;

    const alert = this.alertRepo.create({
      userId: device.userId,
      deviceId: device.id,
      deviceName: device.name,
      sensorType,
      alertType: alertType as any,
      severity: severity as any,
      message,
      value: value ?? undefined,
      threshold,
    });
    await this.alertRepo.save(alert);
    this.logger.warn(`[Alert] ${device.name} / ${sensorType}: ${message}`);
  }
}
