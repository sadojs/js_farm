import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('statistics')
  async getStatistics(
    @CurrentUser('id') userId: string,
    @Query('groupId') groupId?: string,
    @Query('houseId') houseId?: string,
    @Query('sensorType') sensorType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getStatistics(userId, {
      groupId,
      houseId,
      sensorType,
      startDate,
      endDate,
    });
  }

  @Get('hourly')
  async getHourlyData(
    @CurrentUser('id') userId: string,
    @Query('groupId') groupId?: string,
    @Query('houseId') houseId?: string,
    @Query('sensorType') sensorType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getHourlyData(userId, {
      groupId,
      houseId,
      sensorType,
      startDate,
      endDate,
    });
  }

  @Get('actuator-stats')
  async getActuatorStats(
    @CurrentUser('id') userId: string,
    @Query('groupId') groupId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getActuatorStats(userId, {
      groupId,
      startDate,
      endDate,
    });
  }

  @Get('export/csv')
  async exportCsv(
    @CurrentUser('id') userId: string,
    @Res() res: Response,
    @Query('groupId') groupId?: string,
    @Query('houseId') houseId?: string,
    @Query('sensorType') sensorType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const csv = await this.reportsService.exportCsv(userId, {
      groupId,
      houseId,
      sensorType,
      startDate,
      endDate,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=sensor_report_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send('\uFEFF' + csv);
  }
}
