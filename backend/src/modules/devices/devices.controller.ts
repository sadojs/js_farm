import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.devicesService.findAllByUser(userId);
  }

  @Post('register')
  register(
    @CurrentUser('id') userId: string,
    @Body() body: { devices: any[]; houseId?: string },
  ) {
    return this.devicesService.registerBatch(userId, body.devices, body.houseId);
  }

  @Get(':id/status')
  getStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.devicesService.getDeviceStatus(id, userId);
  }

  @Post(':id/control')
  control(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { commands: { code: string; value: any }[] },
  ) {
    return this.devicesService.controlDevice(id, userId, body.commands);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.devicesService.remove(id, userId);
  }
}
