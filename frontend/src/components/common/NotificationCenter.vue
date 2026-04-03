<template>
  <div class="notification-center">
    <!-- 벨 아이콘 -->
    <button class="notification-bell" @click="store.toggle()" aria-label="알림" data-tooltip="알림">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span v-if="store.unreadCount > 0" class="bell-badge">{{ store.unreadCount > 99 ? '99+' : store.unreadCount }}</span>
    </button>

    <!-- 드롭다운 -->
    <Teleport to="body">
      <div v-if="store.isOpen" class="nc-overlay" @click="store.close()"></div>
      <Transition name="nc-slide">
        <div v-if="store.isOpen" class="nc-dropdown">
          <div class="nc-header">
            <h4>알림</h4>
            <button v-if="store.unreadCount > 0" class="nc-mark-all" @click="store.markAllAsRead()">
              모두 읽음
            </button>
          </div>

          <div class="nc-list">
            <div v-if="store.loading" class="nc-loading">불러오는 중...</div>
            <div v-else-if="store.notifications.length === 0" class="nc-empty">
              <p>새로운 알림이 없습니다</p>
            </div>
            <template v-else>
              <div
                v-for="notif in store.notifications.slice(0, 20)"
                :key="notif.id"
                :class="['nc-item', { unread: !notif.read }]"
                @click="handleClick(notif)"
              >
                <span :class="['nc-severity', notif.severity]">{{ severityIcon(notif.severity) }}</span>
                <div class="nc-content">
                  <div class="nc-title">{{ notif.title }}</div>
                  <div class="nc-message">{{ notif.message }}</div>
                  <div class="nc-time">{{ formatTimeAgo(notif.createdAt) }}</div>
                </div>
              </div>
            </template>
          </div>

          <div v-if="store.notifications.length > 0" class="nc-footer">
            <router-link to="/alerts" class="nc-view-all" @click="store.close()">
              전체 알림 보기 →
            </router-link>
          </div>

          <!-- 푸시 알림 권한 요청 -->
          <div v-if="showPushPrompt" class="nc-push-prompt">
            <p>푸시 알림을 활성화하시겠습니까?</p>
            <div class="nc-push-actions">
              <button class="btn-sm" @click="enablePush">활성화</button>
              <button class="btn-sm btn-ghost" @click="showPushPrompt = false">나중에</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useNotificationCenterStore, type AppNotification } from '@/stores/notification-center.store'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/ko'

dayjs.extend(relativeTime)
dayjs.locale('ko')

const store = useNotificationCenterStore()
const showPushPrompt = ref(false)

onMounted(async () => {
  await store.fetchNotifications()
  // 푸시 알림 미 설정 시 프롬프트
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => { showPushPrompt.value = true }, 5000)
  }
})

function severityIcon(severity: string) {
  switch (severity) {
    case 'critical': return '🔴'
    case 'warning': return '🟡'
    case 'success': return '🟢'
    default: return '🔵'
  }
}

function formatTimeAgo(dateStr: string): string {
  return dayjs(dateStr).fromNow()
}

function handleClick(notif: AppNotification) {
  store.markAsRead(notif.id)
}

async function enablePush() {
  await store.requestPushPermission()
  showPushPrompt.value = false
}
</script>

<style scoped>
.notification-center {
  position: relative;
}

.notification-bell {
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-primary, var(--color-text-primary));
  padding: 8px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-bell:hover {
  background: var(--bg-hover, rgba(0,0,0,0.05));
}

.bell-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: var(--color-error);
  color: #fff;
  font-size: var(--font-size-tiny);
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  line-height: 1;
}

.nc-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
}

.nc-dropdown {
  position: fixed;
  top: 56px;
  right: 16px;
  width: 380px;
  max-height: 500px;
  background: var(--bg-card, var(--color-surface));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 768px) {
  .nc-dropdown {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    max-height: 70vh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }
}

.nc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
}

.nc-header h4 {
  margin: 0;
  font-size: var(--font-size-body);
  font-weight: 600;
}

.nc-mark-all {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: var(--font-size-caption);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.nc-mark-all:hover {
  background: var(--bg-hover, rgba(0,0,0,0.05));
}

.nc-list {
  flex: 1;
  overflow-y: auto;
  max-height: 360px;
}

.nc-loading, .nc-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-secondary, var(--color-text-secondary));
  font-size: var(--font-size-label);
}

.nc-item {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.04));
}

.nc-item:hover {
  background: var(--bg-hover, rgba(0,0,0,0.03));
}

.nc-item.unread {
  background: var(--accent-bg, rgba(46, 125, 50, 0.04));
}

.nc-severity {
  flex-shrink: 0;
  font-size: var(--font-size-label);
  margin-top: 2px;
}

.nc-content {
  flex: 1;
  min-width: 0;
}

.nc-title {
  font-size: var(--font-size-caption);
  font-weight: 600;
  color: var(--text-primary, var(--color-text-primary));
  margin-bottom: 2px;
}

.nc-message {
  font-size: var(--font-size-caption);
  color: var(--text-secondary, var(--color-text-secondary));
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nc-time {
  font-size: var(--font-size-tiny);
  color: var(--text-muted, var(--color-text-disabled));
  margin-top: 4px;
}

.nc-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border-color, var(--color-border));
  text-align: center;
}

.nc-view-all {
  font-size: var(--font-size-caption);
  color: var(--color-primary);
  text-decoration: none;
}

.nc-view-all:hover {
  text-decoration: underline;
}

.nc-push-prompt {
  padding: 12px 16px;
  background: var(--accent-bg, rgba(46, 125, 50, 0.06));
  border-top: 1px solid var(--border-color, var(--color-border));
}

.nc-push-prompt p {
  font-size: var(--font-size-caption);
  margin: 0 0 8px;
  color: var(--text-primary, var(--color-text-primary));
}

.nc-push-actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-caption);
  cursor: pointer;
  border: none;
  background: var(--color-primary);
  color: #fff;
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary, var(--color-text-secondary));
}

/* Transition */
.nc-slide-enter-active, .nc-slide-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.nc-slide-enter-from, .nc-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@media (max-width: 768px) {
  .nc-slide-enter-from, .nc-slide-leave-to {
    transform: translateY(100%);
  }
}
</style>
