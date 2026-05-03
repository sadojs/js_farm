import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UpdateTuyaProjectDto, CreateTuyaProjectDto } from './dto/user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // 자기 정보 수정 (모든 인증된 사용자)
  @Put('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateSelf(userId, dto);
  }

  // 자기 Tuya 프로젝트 수정 (하위 호환)
  @Put('me/tuya')
  updateMyTuya(@CurrentUser('id') userId: string, @Body() dto: UpdateTuyaProjectDto) {
    return this.usersService.updateTuyaProject(userId, dto);
  }

  // 다중 Tuya 프로젝트 관리
  @Get('me/tuya-projects')
  listMyTuyaProjects(@CurrentUser('id') userId: string) {
    return this.usersService.listTuyaProjects(userId);
  }

  @Post('me/tuya-projects')
  addMyTuyaProject(@CurrentUser('id') userId: string, @Body() dto: CreateTuyaProjectDto) {
    return this.usersService.addTuyaProject(userId, dto);
  }

  @Put('me/tuya-projects/:projectId')
  updateMyTuyaProject(
    @CurrentUser('id') userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: Partial<UpdateTuyaProjectDto & { label?: string }>,
  ) {
    return this.usersService.updateTuyaProjectById(userId, projectId, dto);
  }

  @Delete('me/tuya-projects/:projectId')
  deleteMyTuyaProject(@CurrentUser('id') userId: string, @Param('projectId') projectId: string) {
    return this.usersService.deleteTuyaProject(userId, projectId);
  }

  // 이하 관리자 전용
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  findAll() {
    return this.usersService.findAll();
  }

  // 팜 관리자 목록 (farm_user 등록 시 소속 선택용) — :id 위에 배치
  @Get('farm-admins')
  @UseGuards(RolesGuard)
  @Roles('admin')
  findFarmAdmins() {
    return this.usersService.findFarmAdmins();
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Put(':id/tuya')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateTuya(@Param('id') id: string, @Body() dto: UpdateTuyaProjectDto) {
    return this.usersService.updateTuyaProject(id, dto);
  }

  @Get(':id/tuya-projects')
  @UseGuards(RolesGuard)
  @Roles('admin')
  listTuyaProjects(@Param('id') id: string) {
    return this.usersService.listTuyaProjects(id);
  }

  @Put(':id/tuya-projects/:projectId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateTuyaProject(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @Body() dto: Partial<UpdateTuyaProjectDto & { label?: string }>,
  ) {
    return this.usersService.updateTuyaProjectById(id, projectId, dto);
  }
}
