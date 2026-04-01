<template>
  <div class="irrigation-history-card">
    <div class="widget-header">
      <h3>관수 실행 이력</h3>
      <span class="badge">오늘 {{ stats.todayCount }}회</span>
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
import { ref, onMounted } from 'vue'
import { automationLogApi } from '../../api/automation-log.api'
import type { AutomationLogEntry, AutomationLogStats } from '../../api/automation-log.api'

const stats = ref<AutomationLogStats>({ todayCount: 0, successRate: 0, mostActiveRule: null })
const recentLogs = ref<AutomationLogEntry[]>([])

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
  recentLogs.value = l.data
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
  font-size: calc(18px * var(--content-scale, 1));
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}
.badge {
  background: var(--accent-bg);
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
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
  font-size: calc(20px * var(--content-scale, 1));
  font-weight: 700;
  color: var(--text-primary);
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.recent-logs h4 {
  font-size: 14px;
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
  font-size: 13px;
}
.log-entry:last-child { border-bottom: none; }
.log-status {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.log-status.success { background: #e8f5e9; color: #2e7d32; }
.log-status.fail { background: #ffebee; color: #c62828; }
.log-name { flex: 1; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-time { color: var(--text-muted); font-size: 12px; flex-shrink: 0; }
.empty-text { text-align: center; color: var(--text-muted); font-size: 14px; padding: 16px 0; }
</style>
