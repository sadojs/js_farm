import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface ReportParams {
  groupId?: string;
  houseId?: string;
  sensorType?: string;
  startDate?: string;
  endDate?: string;
  aggregation?: string;
}

@Injectable()
export class ReportsService {
  constructor(private dataSource: DataSource) {}

  private buildConditions(userId: string, params: ReportParams, alias = 'sd') {
    const conditions: string[] = [`${alias}.user_id = $1`];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (params.sensorType) {
      conditions.push(`${alias}.sensor_type = $${paramIndex++}`);
      values.push(params.sensorType);
    }
    if (params.startDate) {
      const timeCol = alias === 'sh' ? `${alias}.bucket` : `${alias}.time`;
      conditions.push(`${timeCol} >= $${paramIndex++}`);
      values.push(params.startDate);
    }
    if (params.endDate) {
      const timeCol = alias === 'sh' ? `${alias}.bucket` : `${alias}.time`;
      conditions.push(`${timeCol} <= $${paramIndex++}`);
      values.push(params.endDate);
    }
    if (params.houseId) {
      conditions.push(`d.house_id = $${paramIndex++}`);
      values.push(params.houseId);
    }
    if (params.groupId) {
      conditions.push(`h.group_id = $${paramIndex++}`);
      values.push(params.groupId);
    }
    return { conditions, values, paramIndex };
  }

  async getStatistics(userId: string, params: ReportParams) {
    const { conditions, values } = this.buildConditions(userId, params);
    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT
        sd.sensor_type,
        COUNT(*) as count,
        ROUND(AVG(sd.value)::numeric, 2) as avg_value,
        ROUND(MIN(sd.value)::numeric, 2) as min_value,
        ROUND(MAX(sd.value)::numeric, 2) as max_value,
        ROUND(STDDEV(sd.value)::numeric, 2) as stddev_value,
        sd.unit
      FROM sensor_data sd
      JOIN devices d ON d.id = sd.device_id
      LEFT JOIN houses h ON h.id = d.house_id
      WHERE ${whereClause}
      GROUP BY sd.sensor_type, sd.unit
      ORDER BY sd.sensor_type
    `;

    const stats = await this.dataSource.query(query, values);

    // Daily breakdown
    const dailyQuery = `
      SELECT
        DATE(sd.time) as date,
        sd.sensor_type,
        ROUND(AVG(sd.value)::numeric, 2) as avg_value,
        ROUND(MIN(sd.value)::numeric, 2) as min_value,
        ROUND(MAX(sd.value)::numeric, 2) as max_value,
        COUNT(*) as count
      FROM sensor_data sd
      JOIN devices d ON d.id = sd.device_id
      LEFT JOIN houses h ON h.id = d.house_id
      WHERE ${whereClause}
      GROUP BY DATE(sd.time), sd.sensor_type
      ORDER BY date ASC, sd.sensor_type
    `;

    const daily = await this.dataSource.query(dailyQuery, values);

    return { statistics: stats, daily };
  }

  async getHourlyData(userId: string, params: ReportParams) {
    const { conditions, values } = this.buildConditions(userId, params, 'sh');
    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT
        sh.bucket as time,
        sh.sensor_type,
        ROUND(sh.avg_value::numeric, 2) as avg_value,
        ROUND(sh.min_value::numeric, 2) as min_value,
        ROUND(sh.max_value::numeric, 2) as max_value,
        sh.sample_count as count
      FROM sensor_data_hourly sh
      JOIN devices d ON d.id = sh.device_id
      LEFT JOIN houses h ON h.id = d.house_id
      WHERE ${whereClause}
      ORDER BY sh.bucket ASC
      LIMIT 1000
    `;

    return this.dataSource.query(query, values);
  }

  async getActuatorStats(userId: string, params: ReportParams) {
    const conditions: string[] = ['al.user_id = $1'];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (params.startDate) {
      conditions.push(`al.executed_at >= $${paramIndex++}`);
      values.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push(`al.executed_at <= $${paramIndex++}`);
      values.push(params.endDate);
    }
    if (params.groupId) {
      conditions.push(`ar.group_id = $${paramIndex++}`);
      values.push(params.groupId);
    }

    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT
        date_trunc('hour', al.executed_at) as time,
        COUNT(DISTINCT al.device_id) as active_devices,
        COUNT(*) as total_actions
      FROM automation_logs al
      LEFT JOIN automation_rules ar ON ar.id = al.rule_id
      WHERE ${whereClause}
      GROUP BY date_trunc('hour', al.executed_at)
      ORDER BY time ASC
    `;

    return this.dataSource.query(query, values);
  }

  async exportCsv(userId: string, params: ReportParams): Promise<string> {
    const { conditions, values } = this.buildConditions(userId, params);
    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT
        sd.time,
        d.name as device_name,
        sd.sensor_type,
        sd.value,
        sd.unit,
        sd.status,
        h.name as house_name,
        hg.name as group_name
      FROM sensor_data sd
      JOIN devices d ON d.id = sd.device_id
      LEFT JOIN houses h ON h.id = d.house_id
      LEFT JOIN house_groups hg ON hg.id = h.group_id
      WHERE ${whereClause}
      ORDER BY sd.time ASC
      LIMIT 10000
    `;

    const rows = await this.dataSource.query(query, values);

    const header = '시간,장비명,센서종류,값,단위,상태,하우스,그룹';
    const csvRows = rows.map((row: any) =>
      [
        row.time,
        row.device_name,
        row.sensor_type,
        row.value,
        row.unit,
        row.status,
        row.house_name || '',
        row.group_name || '',
      ].join(','),
    );

    return [header, ...csvRows].join('\n');
  }
}
