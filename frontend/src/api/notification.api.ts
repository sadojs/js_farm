import client from './client'
import type { AppNotification } from '@/stores/notification-center.store'

export const notificationApi = {
  async getNotifications(page = 1, limit = 50): Promise<AppNotification[]> {
    const { data } = await client.get('/notifications', { params: { page, limit } })
    return data.data || data
  },

  async markAsRead(id: string): Promise<void> {
    await client.patch(`/notifications/${id}/read`)
  },

  async markAllAsRead(): Promise<void> {
    await client.patch('/notifications/read-all')
  },

  async deleteNotification(id: string): Promise<void> {
    await client.delete(`/notifications/${id}`)
  },

  async subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
    await client.post('/notifications/push-subscribe', subscription)
  },
}
