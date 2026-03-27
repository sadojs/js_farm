import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notificationApi } from '@/api/notification.api'

export interface AppNotification {
  id: string
  type: 'sensor_alert' | 'device_offline' | 'device_online' | 'automation_executed' | 'automation_failed' | 'system'
  title: string
  message: string
  severity: 'critical' | 'warning' | 'info' | 'success'
  read: boolean
  createdAt: string
  metadata?: {
    deviceId?: string
    ruleId?: string
    sensorType?: string
    value?: number
    threshold?: number
  }
}

export const useNotificationCenterStore = defineStore('notification-center', () => {
  const notifications = ref<AppNotification[]>([])
  const isOpen = ref(false)
  const loading = ref(false)

  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

  function addNotification(notif: AppNotification) {
    notifications.value.unshift(notif)
    // 최대 100개 유지
    if (notifications.value.length > 100) {
      notifications.value = notifications.value.slice(0, 100)
    }
  }

  function markAsRead(id: string) {
    const notif = notifications.value.find(n => n.id === id)
    if (notif) {
      notif.read = true
      notificationApi.markAsRead(id).catch(() => {})
    }
  }

  function markAllAsRead() {
    notifications.value.forEach(n => { n.read = true })
    notificationApi.markAllAsRead().catch(() => {})
  }

  async function fetchNotifications() {
    loading.value = true
    try {
      const data = await notificationApi.getNotifications()
      notifications.value = data
    } catch {
      // 실패 시 빈 배열 유지
    } finally {
      loading.value = false
    }
  }

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function close() {
    isOpen.value = false
  }

  // Web Push 구독 요청
  async function requestPushPermission() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY || '',
      })
      await notificationApi.subscribePush(subscription.toJSON())
      return true
    } catch {
      return false
    }
  }

  return {
    notifications,
    isOpen,
    loading,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    toggle,
    close,
    requestPushPermission,
  }
})
