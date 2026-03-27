<template>
  <div class="automation-log">
    <!-- 통계 미니 카드 -->
    <div class="log-stats">
      <div class="stat-card">
        <span class="stat-value">{{ stats.todayCount }}</span>
        <span class="stat-label">오늘 실행</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.successRate }}%</span>
        <span class="stat-label">성공률</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.mostActiveRule || '-' }}</span>
        <span class="stat-label">가장 활발</span>
      </div>
    </div>

    <!-- 로그 리스트 -->
    <div v-if="loading" class="log-loading">로그를 불러오는 중...</div>
    <div v-else-if="logs.length === 0" class="log-empty">
      <EmptyState
        icon="rule"
        title="실행 기록이 없습니다"
        description="자동화 룰이 실행되면 여기에 기록됩니다"
      />
    </div>
    <div v-else class="log-timeline">
      <div
        v-for="log in logs"
        :key="log.id"
        :class="['log-entry', log.success ? 'success' : 'failed']"
      >
        <div class="log-indicator">
          <span :class="['log-dot', log.success ? 'success' : 'failed']"></span>
          <span class="log-line"></span>
        </div>
        <div class="log-body">
          <div class="log-header">
            <span :class="['log-status', log.success ? 'success' : 'failed']">
              {{ log.success ? '🟢' : '🔴' }}
            </span>
            <span class="log-time">{{ formatTime(log.executedAt) }}</span>
            <span class="log-rule-name">{{ log.ruleName || '알 수 없는 룰' }}</span>
          </div>
          <div class="log-details">
            <div v-if="log.conditionsMet && Object.keys(log.conditionsMet).length > 0" class="log-detail-row">
              <span class="detail-label">조건:</span>
              <span class="detail-value">{{ formatConditions(log.conditionsMet) }}</span>
            </div>
            <div v-if="log.actionsExecuted && Object.keys(log.actionsExecuted).length > 0" class="log-detail-row">
              <span class="detail-label">동작:</span>
              <span class="detail-value">{{ formatActions(log.actionsExecuted) }}</span>
            </div>
            <div v-if="log.errorMessage" class="log-error">
              <span class="detail-label">오류:</span>
              <span class="detail-value error">{{ log.errorMessage }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 더보기 -->
      <button v-if="hasMore" class="log-more-btn" @click="loadMore" :disabled="loadingMore">
        {{ loadingMore ? '불러오는 중...' : '더보기' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { automationLogApi, type AutomationLogEntry, type AutomationLogStats } from '@/api/automation-log.api'
import EmptyState from '@/components/common/EmptyState.vue'
import dayjs from 'dayjs'

const logs = ref<AutomationLogEntry[]>([])
const stats = ref<AutomationLogStats>({ todayCount: 0, successRate: 0, mostActiveRule: null })
const loading = ref(true)
const loadingMore = ref(false)
const page = ref(1)
const hasMore = ref(true)

onMounted(async () => {
  await Promise.all([fetchLogs(), fetchStats()])
})

async function fetchLogs() {
  loading.value = true
  try {
    const result = await automationLogApi.getLogs({ page: 1, limit: 20 })
    logs.value = result.data
    hasMore.value = result.data.length >= 20
  } catch {
    logs.value = []
  } finally {
    loading.value = false
  }
}

async function fetchStats() {
  stats.value = await automationLogApi.getStats()
}

async function loadMore() {
  loadingMore.value = true
  page.value++
  try {
    const result = await automationLogApi.getLogs({ page: page.value, limit: 20 })
    logs.value.push(...result.data)
    hasMore.value = result.data.length >= 20
  } finally {
    loadingMore.value = false
  }
}

function formatTime(dateStr: string): string {
  return dayjs(dateStr).format('HH:mm')
}

function formatConditions(conditions: Record<string, any>): string {
  if (typeof conditions === 'string') return conditions
  const entries = Object.entries(conditions)
  if (entries.length === 0) return '-'
  return entries.map(([k, v]) => `${k}: ${v}`).join(', ')
}

function formatActions(actions: Record<string, any>): string {
  if (typeof actions === 'string') return actions
  const entries = Object.entries(actions)
  if (entries.length === 0) return '-'
  return entries.map(([k, v]) => `${k} → ${v}`).join(', ')
}
</script>

<style scoped>
.automation-log {
  padding: 0;
}

.log-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.stat-card {
  background: var(--bg-card, var(--color-surface));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  padding: 14px;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text-primary));
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.log-loading {
  text-align: center;
  padding: 32px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.log-timeline {
  display: flex;
  flex-direction: column;
}

.log-entry {
  display: flex;
  gap: 12px;
  padding-bottom: 16px;
}

.log-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  flex-shrink: 0;
}

.log-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.log-dot.success { background: var(--color-success); }
.log-dot.failed { background: var(--color-error); }

.log-line {
  width: 2px;
  flex: 1;
  background: var(--border-color, var(--color-border));
  margin-top: 4px;
}

.log-body {
  flex: 1;
  min-width: 0;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.log-status {
  font-size: 12px;
}

.log-time {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text-primary));
}

.log-rule-name {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-details {
  padding-left: 4px;
}

.log-detail-row {
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
  margin-bottom: 2px;
  display: flex;
  gap: 6px;
}

.detail-label {
  color: var(--text-muted, var(--color-text-disabled));
  flex-shrink: 0;
}

.detail-value.error {
  color: var(--color-error);
}

.log-more-btn {
  align-self: center;
  padding: 8px 24px;
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  font-size: 13px;
  margin-top: 8px;
}

.log-more-btn:hover {
  background: var(--bg-hover, rgba(0,0,0,0.03));
}

@media (max-width: 768px) {
  .log-stats {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .stat-card {
    padding: 10px 8px;
  }
  .stat-value {
    font-size: 16px;
  }
}
</style>
