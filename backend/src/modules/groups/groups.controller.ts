import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @Get()
  findAllGroups(@CurrentUser('id') userId: string) {
    return this.groupsService.findAllGroups(userId);
  }

  @Post()
  createGroup(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.groupsService.createGroup(userId, body);
  }

  @Put(':id')
  updateGroup(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() body: any) {
    return this.groupsService.updateGroup(id, userId, body);
  }

  @Delete(':id')
  removeGroup(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.groupsService.removeGroup(id, userId);
  }

  @Get('houses')
  findAllHouses(@CurrentUser('id') userId: string) {
    return this.groupsService.findAllHouses(userId);
  }

  @Post('houses')
  createHouse(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.groupsService.createHouse(userId, body);
  }

  @Put('houses/:id')
  updateHouse(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() body: any) {
    return this.groupsService.updateHouse(id, userId, body);
  }

  @Delete('houses/:id')
  removeHouse(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.groupsService.removeHouse(id, userId);
  }

  @Post(':id/devices')
  assignDevices(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { deviceIds: string[] },
  ) {
    return this.groupsService.assignDevices(id, userId, body.deviceIds);
  }

  @Delete(':id/devices/:deviceId')
  removeDeviceFromGroup(
    @Param('id') id: string,
    @Param('deviceId') deviceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.groupsService.removeDeviceFromGroup(id, userId, deviceId);
  }
}
