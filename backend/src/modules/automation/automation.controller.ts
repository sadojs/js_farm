import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { CreateRuleDto, UpdateRuleDto } from './dto/create-rule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('automation')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Get('rules')
  findAll(@CurrentUser('id') userId: string) {
    return this.automationService.findAll(userId);
  }

  @Post('rules')
  create(@CurrentUser('id') userId: string, @Body() dto: CreateRuleDto) {
    return this.automationService.create(userId, dto);
  }

  @Put('rules/:id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateRuleDto) {
    return this.automationService.update(id, userId, dto);
  }

  @Patch('rules/:id/toggle')
  toggle(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.automationService.toggle(id, userId);
  }

  @Post('rules/:id/run')
  runNow(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.automationService.runRuleNow(id, userId);
  }

  @Delete('rules/:id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.automationService.remove(id, userId);
  }

  @Get('logs')
  getLogs(
    @CurrentUser('id') userId: string,
    @Query('ruleId') ruleId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.automationService.getLogs(userId, {
      ruleId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
