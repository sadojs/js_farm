<template>
  <div class="irrigation-history-card">
    <div class="widget-header">
      <h3>관수 현황</h3>
      <span class="badge">오늘 {{ stats.todayCount }}회</span>
    </div>

    <!-- 실시간 상태 섹션 -->
    <div v-if="irrigationDevices.length > 0" class="realtime-section">
      <div v-for="device in irrigationDevices" :key="device.deviceId" class="device-status-row">
        <span class="device-name">{{ device.deviceName }}</span>
        <div class="status-badges">
          <span v-if="device.enabledRuleCount > 0" class="status-badge active">
            자동화 활성 ({{ device.enabledRuleCount }})
          </span>
          <span v-else class="status-badge inactive">비활성</span>
          <span v-if="device.isRunning" class="status-badge running">
            가동중 — {{ device.runningRule?.ruleName }}
            <template v-if="getRemainingMin(device) > 0"> ({{ getRemainingMin(device) }}분)</template>
          </span>
          <span v-else class="status-badge idle">대기</span>
        </div>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-item">
        <span class="stat-value">{{ stats.successRate }}%</span>
        <span class="stat-label">성공률</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ stats.todayCount }}</span>
        <span class="stat-label">오늘 실행</span>
      </div>
      <div class="stat-item">
        <span class="stat-value" :title="stats.mostActiveRule || '-'">{{ truncate(stats.mostActiveRule, 8) }}</span>
        <span class="stat-label">최다 실행</span>
      </div>
    </div>

    <div v-if="recentLogs.length > 0" class="recent-logs">
      <h4>최근 실행</h4>
      <div v-for="log in recentLogs" :key="log.id" class="log-entry">
        <span class="log-status" :class="log.success ? 'success' : 'fail'">
          {{ log.success ? '성공' : '실패' }}
        </span>
        <span class="log-name">{{ log.ruleName || '규칙' }}</span>
        <span class="log-time">{{ formatTime(log.executedAt) }}</span>
      </div>
    </div>
    <div v-else class="empty-text">최근 실행 이력이 없습니다</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { automationLogApi } from '../../api/automation-log.api'
import type { AutomationLogEntry, AutomationLogStats } from '../../api/automation-log.api'
import { useAutomationStore } from '../../stores/automation.store'
import type { IrrigationDeviceStatus } from '../../api/automation.api'

const automationStore = useAutomationStore()
const stats = ref<AutomationLogStats>({ todayCount: 0, successRate: 0, mostActiveRule: null })
const recentLogs = ref<AutomationLogEntry[]>([])
const irrigationDevices = computed(() => automationStore.irrigationStatus)

function getRemainingMin(device: IrrigationDeviceStatus): number {
  if (!device.runningRule?.estimatedEndAt) return 0
  return Math.max(0, Math.ceil((device.runningRule.estimatedEndAt - Date.now()) / 60000))
}

// 가동중 장비 있으면 15초 폴링
let pollTimer: ReturnType<typeof setInterval> | null = null
watch(irrigationDevices, (devs) => {
  const hasRunning = devs.some(d => d.isRunning)
  if (hasRunning && !pollTimer) {
    pollTimer = setInterval(() => automationStore.fetchIrrigationStatus(), 15000)
  } else if (!hasRunning && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}, { immediate: true })
onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer) })

function truncate(text: string | null, maxLen: number): string {
  if (!text) return '-'
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(async () => {
  const [s, l] = await Promise.all([
    automationLogApi.getStats(),
    automationLogApi.getLogs({ limit: 5 }),
  ])
  stats.value = s
  recentLogs.value = Array.isArray(l) ? l : (l.data ?? [])
  // 별도 호출 (404 시에도 기존 기능에 영향 없음)
  automationStore.fetchIrrigationStatus()
})
</script>

<style scoped>
.irrigation-history-card {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 24px;
  box-shadow: var(--shadow-card);
}
.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.widget-header h3 {
  font-size: var(--font-size-subtitle);
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}
.badge {
  background: var(--accent-bg);
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: var(--font-size-caption);
  font-weight: 600;
}
.realtime-section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light);
}
.device-status-row {
  padding: 8px 0;
}
.device-status-row + .device-status-row {
  border-top: 1px solid var(--border-light);
}
.device-name {
  font-size: var(--font-size-label);
  font-weight: 600;
  color: var(--text-primary);
  display: block;
  margin-bottom: 6px;
}
.status-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.status-badge {
  font-size: var(--font-size-tiny);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}
.status-badge.active { background: #e8f5e9; color: #2e7d32; }
.status-badge.inactive { background: var(--bg-badge); color: var(--text-muted); }
.status-badge.running { background: #e3f2fd; color: #1565c0; }
.status-badge.idle { background: var(--bg-badge); color: var(--text-muted); }

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.stat-item {
  text-align: center;
  padding: 12px 8px;
  background: var(--bg-secondary);
  border-radius: 12px;
}
.stat-value {
  display: block;
  font-size: var(--font-size-subtitle);
  font-weight: 700;
  color: var(--text-primary);
}
.stat-label {
  font-size: var(--font-size-caption);
  color: var(--text-secondary);
  margin-top: 4px;
}
.recent-logs h4 {
  font-size: var(--font-size-label);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}
.log-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light);
  font-size: var(--font-size-caption);
}
.log-entry:last-child { border-bottom: none; }
.log-status {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: var(--font-size-tiny);
  font-weight: 600;
  flex-shrink: 0;
}
.log-status.success { background: #e8f5e9; color: #2e7d32; }
.log-status.fail { background: #ffebee; color: #c62828; }
.log-name { flex: 1; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-time { color: var(--text-muted); font-size: var(--font-size-caption); flex-shrink: 0; }
.empty-text { text-align: center; color: var(--text-muted); font-size: var(--font-size-label); padding: 16px 0; }
</style>
