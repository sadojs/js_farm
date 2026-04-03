import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ActivityLogService } from '../activity-log/activity-log.service';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(
    private devicesService: DevicesService,
    private activityLog: ActivityLogService,
  ) {}

  private getEffectiveUserId(user: any): string {
    return user.role === 'farm_user' && user.parentUserId ? user.parentUserId : user.id;
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.devicesService.findAllByUser(this.getEffectiveUserId(user));
  }

  @Post('register')
  async register(
    @CurrentUser() user: any,
    @Body() body: { devices: any[]; houseId?: string },
  ) {
    const result = await this.devicesService.registerBatch(this.getEffectiveUserId(user), body.devices, body.houseId);
    for (const d of body.devices) {
      this.activityLog.log({
        userId: user.id, userName: user.name || user.username,
        action: 'device.register', targetType: 'device', targetName: d.name,
        details: { category: d.category, deviceType: d.deviceType },
      });
    }
    return result;
  }

  @Get(':id/status')
  getStatus(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.devicesService.getDeviceStatus(id, this.getEffectiveUserId(user));
  }

  @Post(':id/control')
  async control(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { commands: { code: string; value: any }[] },
  ) {
    const result = await this.devicesService.controlDevice(id, this.getEffectiveUserId(user), body.commands);
    this.activityLog.log({
      userId: user.id, userName: user.name || user.username,
      action: 'device.control', targetType: 'device', targetId: id,
      details: { commands: body.commands },
    });
    return result;
  }

  @Get(':id/dependencies')
  getDependencies(@Param('id') id: string, @CurrentUser() user: any) {
    return this.devicesService.getDependencies(id, this.getEffectiveUserId(user));
  }

  @Patch(':id/channel-mapping')
  updateChannelMapping(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { mapping: Record<string, string> },
  ) {
    const effectiveUserId = user.role === 'farm_user' && user.parentUserId ? user.parentUserId : user.id;
    return this.devicesService.updateChannelMapping(id, effectiveUserId, user.role, body.mapping);
  }

  @Delete(':id/opener-pair')
  @HttpCode(HttpStatus.OK)
  removeOpenerPair(@Param('id') id: string, @CurrentUser() user: any) {
    return this.devicesService.removeOpenerPair(id, this.getEffectiveUserId(user));
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.devicesService.remove(id, this.getEffectiveUserId(user));
    this.activityLog.log({
      userId: user.id, userName: user.name || user.username,
      action: 'device.delete', targetType: 'device', targetId: id,
    });
    return result;
  }
}
