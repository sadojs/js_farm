import { Controller, Get, Patch, Delete, Param, Post, Body, UseGuards, Request } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  @Get()
  getNotifications() {
    return { data: [], total: 0 }
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return { success: true }
  }

  @Patch('read-all')
  markAllAsRead() {
    return { success: true }
  }

  @Delete(':id')
  deleteNotification(@Param('id') id: string) {
    return { success: true }
  }

  @Post('push-subscribe')
  subscribePush(@Body() subscription: any) {
    return { success: true }
  }
}
