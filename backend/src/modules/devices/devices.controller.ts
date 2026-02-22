import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  private getEffectiveUserId(user: any): string {
    return user.role === 'farm_user' && user.parentUserId ? user.parentUserId : user.id;
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.devicesService.findAllByUser(this.getEffectiveUserId(user));
  }

  @Post('register')
  register(
    @CurrentUser() user: any,
    @Body() body: { devices: any[]; houseId?: string },
  ) {
    return this.devicesService.registerBatch(this.getEffectiveUserId(user), body.devices, body.houseId);
  }

  @Get(':id/status')
  getStatus(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.devicesService.getDeviceStatus(id, this.getEffectiveUserId(user));
  }

  @Post(':id/control')
  control(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { commands: { code: string; value: any }[] },
  ) {
    return this.devicesService.controlDevice(id, this.getEffectiveUserId(user), body.commands);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.devicesService.remove(id, this.getEffectiveUserId(user));
  }
}
