<template>
  <div class="page-container">
    <header class="page-header">
      <div>
        <h2>농장 환경</h2>
        <p class="page-description">농장 환경을 종합적으로 확인합니다</p>
      </div>
      <button class="btn-refresh" @click="refreshAll" :disabled="refreshing">
        {{ refreshing ? '새로고침 중...' : '새로고침' }}
      </button>
    </header>

    <!-- 로딩 -->
    <div v-if="loading" class="loading-state">
      <p>측정 데이터를 불러오는 중...</p>
    </div>

    <!-- 센서 없음 -->
    <EmptyState
      v-else-if="sensorGroups.length === 0"
      icon="sensor"
      title="측정기가 등록된 구역이 없습니다"
      description="장치를 등록하고 구역에 배치하면 환경 데이터를 확인할 수 있습니다"
      action-label="장치 관리로 이동"
      action-to="/devices"
      :steps="[
        { label: '장치 등록', done: false },
        { label: '구역 설정', done: false },
        { label: '환경 설정', done: false },
        { label: '확인 시작', done: false },
      ]"
    />

    <!-- 그룹별 센서 목록 -->
    <div v-else class="groups-container">
      <div
        v-for="group in sensorGroups"
        :key="group.id"
        class="group-section"
      >
        <!-- 그룹 헤더 -->
        <div class="group-header" @click="toggleGroup(group.id)">
          <div class="group-title">
            <span class="expand-icon">{{ expandedGroups.has(group.id) ? '▼' : '▶' }}</span>
            <h3>{{ group.name }}</h3>
            <span class="sensor-count">{{ group.sensors.length }}개 측정기</span>
          </div>
          <div class="group-summary">
            <span v-for="item in group.summaryItems" :key="item.label" class="summary-chip">
              {{ item.icon }} {{ item.value }}{{ item.unit }}
            </span>
          </div>
        </div>

        <!-- 농장 환경 위젯 (확장 시) -->
        <div v-if="expandedGroups.has(group.id)" class="group-widgets">
          <div v-if="loadingResolvedFor[group.id]" class="env-loading">
            <p>환경 데이터를 불러오는 중...</p>
          </div>
          <template v-else-if="resolvedByGroup[group.id]">
            <!-- 모바일 접이식 센서 뷰 -->
            <div class="mobile-metric-accordion" v-if="isEnvConfigured(group.id)">
              <div
                v-for="metric in getMetricSummary(resolvedByGroup[group.id]!)"
                :key="metric.type"
                class="metric-accordion-item"
              >
                <button class="metric-header" @click="toggleMetric(group.id, metric.type)">
                  <span class="metric-icon">{{ metric.icon }}</span>
                  <span class="metric-label">{{ metric.label }}</span>
                  <span class="metric-value">{{ metric.value }}{{ metric.unit }}</span>
                  <span :class="['metric-badge', metric.status]">{{ metric.statusText }}</span>
                  <span :class="['accordion-arrow', { open: isMetricOpen(group.id, metric.type) }]">▶</span>
                </button>
                <Transition name="accordion">
                  <div v-if="isMetricOpen(group.id, metric.type)" class="metric-detail">
                    <div class="metric-detail-row">
                      <span class="detail-key">적정 범위</span>
                      <span class="detail-val">{{ metric.range }}</span>
                    </div>
                    <div class="metric-detail-row">
                      <span class="detail-key">현재 상태</span>
                      <span :class="['detail-val', metric.status]">{{ metric.statusText }}</span>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
            <ResolvedEnvPanel
              v-if="isEnvConfigured(group.id)"
              :resolved="resolvedByGroup[group.id]!"
            />
            <GroupEnvScore
              v-if="isEnvConfigured(group.id)"
              :resolved-data="resolvedByGroup[group.id]!"
            />
            <div v-else class="env-unconfigured">
              <p>환경 설정이 필요합니다</p>
              <router-link :to="`/groups?envConfig=${group.id}`" class="btn-cta">환경 설정하기</router-link>
            </div>
          </template>
          <div v-else class="env-unconfigured">
            <p>환경 설정이 필요합니다</p>
            <router-link :to="`/groups?envConfig=${group.id}`" class="btn-cta">환경 설정하기</router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGroupStore } from '@/stores/group.store'
import { useDeviceStore } from '@/stores/device.store'
import { useWebSocket } from '@/composables/useWebSocket'
import { envConfigApi } from '@/api/env-config.api'
import type { ResolvedValue } from '@/api/env-config.api'
import ResolvedEnvPanel from '@/components/dashboard/ResolvedEnvPanel.vue'
import GroupEnvScore from '@/components/dashboard/GroupEnvScore.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { Device } from '@/types/device.types'

const groupStore = useGroupStore()
const deviceStore = useDeviceStore()
const loading = ref(true)
const refreshing = ref(false)
const expandedGroups = ref(new Set<string>())
const expandedMetrics = ref<Set<string>>(new Set())

function toggleMetric(groupId: string, metricType: string) {
  const key = `${groupId}:${metricType}`
  if (expandedMetrics.value.has(key)) {
    expandedMetrics.value.delete(key)
  } else {
    expandedMetrics.value.add(key)
  }
}

function isMetricOpen(groupId: string, metricType: string): boolean {
  return expandedMetrics.value.has(`${groupId}:${metricType}`)
}

interface MetricSummaryItem {
  type: string
  icon: string
  label: string
  value: string
  unit: string
  status: string
  statusText: string
  range: string
}

function getMetricSummary(resolved: any): MetricSummaryItem[] {
  if (!resolved?.metrics) return []

  const metricDefs: Record<string, { icon: string; label: string; unit: string }> = {
    temperature: { icon: '🌡️', label: '온도', unit: '°C' },
    humidity: { icon: '💧', label: '습도', unit: '%' },
    co2: { icon: '💨', label: 'CO₂', unit: 'ppm' },
    light: { icon: '☀️', label: '조도', unit: 'lx' },
    soil_moisture: { icon: '🌱', label: '토양수분', unit: '%' },
    vpd: { icon: '🌬️', label: 'VPD', unit: 'kPa' },
    dew_point: { icon: '🌫️', label: '이슬점', unit: '°C' },
  }

  return Object.entries(resolved.metrics || {}).map(([type, data]: [string, any]) => {
    const def = metricDefs[type] || { icon: '📊', label: type, unit: '' }
    const value = data?.current ?? data?.value ?? '-'
    const status = data?.status || 'normal'
    const statusText = status === 'normal' || status === 'good' ? '적정' : status === 'warning' ? '주의' : status === 'danger' ? '위험' : status
    const min = data?.min ?? data?.targetMin ?? '-'
    const max = data?.max ?? data?.targetMax ?? '-'
    return {
      type,
      icon: def.icon,
      label: def.label,
      value: typeof value === 'number' ? value.toFixed(1) : String(value),
      unit: def.unit,
      status,
      statusText,
      range: `${min} ~ ${max}${def.unit}`,
    }
  }).filter(m => m.value !== '-')
}

// 그룹별 resolved 환경 데이터
const resolvedByGroup = ref<Record<string, Record<string, ResolvedValue> | null>>({})
const loadingResolvedFor = ref<Record<string, boolean>>({})

// 센서 필드 메타데이터 (DB 기록은 전체, 화면 표시는 DISPLAY_FIELDS만)
const SENSOR_FIELD_META: Record<string, { label: string; icon: string; unit: string; min: number; max: number; color: string }> = {
  temperature: { label: '온도', icon: '🌡️', unit: '°C', min: -10, max: 50, color: '#f44336' },
  humidity: { label: '습도', icon: '💧', unit: '%', min: 0, max: 100, color: '#2196f3' },
  rainfall: { label: '강우량', icon: '🌧️', unit: 'mm', min: 0, max: 100, color: '#1565c0' },
  uv: { label: 'UV', icon: '☀️', unit: '', min: 0, max: 11, color: '#ff9800' },
  dew_point: { label: '이슬점', icon: '💦', unit: '°C', min: -10, max: 40, color: '#00bcd4' },
  co2: { label: 'CO2', icon: '🌫️', unit: 'ppm', min: 0, max: 2000, color: '#9c27b0' },
  light: { label: '조도', icon: '💡', unit: 'lux', min: 0, max: 100000, color: '#ff9800' },
  soil_moisture: { label: '토양수분', icon: '🌱', unit: '%', min: 0, max: 100, color: '#795548' },
  ph: { label: 'PH', icon: '⚗️', unit: '', min: 0, max: 14, color: '#009688' },
  ec: { label: 'EC', icon: '⚡', unit: 'mS/cm', min: 0, max: 10, color: '#607d8b' },
}

// 화면에 표시할 센서 필드 (DB에는 전체 기록)
const DISPLAY_FIELDS = ['temperature', 'humidity', 'co2', 'rainfall', 'uv', 'dew_point']

interface SummaryItem {
  label: string
  icon: string
  value: string
  unit: string
}

interface SensorGroupView {
  id: string
  name: string
  sensors: Device[]
  summaryItems: SummaryItem[]
}

const sensorGroups = computed<SensorGroupView[]>(() => {
  return groupStore.groups
    .map(group => {
      const groupSensorIds = (group.devices || [])
        .filter(d => d.deviceType === 'sensor')
        .map(d => d.id)
      const sensors = deviceStore.devices.filter(d => groupSensorIds.includes(d.id))
      if (sensors.length === 0) return null

      const fieldSums: Record<string, { sum: number; count: number }> = {}
      for (const sensor of sensors) {
        if (!sensor.sensorData) continue
        for (const [key, val] of Object.entries(sensor.sensorData)) {
          if (val == null || !DISPLAY_FIELDS.includes(key)) continue
          if (!fieldSums[key]) fieldSums[key] = { sum: 0, count: 0 }
          fieldSums[key].sum += val
          fieldSums[key].count++
        }
      }

      const summaryItems: SummaryItem[] = Object.entries(fieldSums).map(([key, { sum, count }]) => {
        const meta = SENSOR_FIELD_META[key]
        const avg = sum / count
        return {
          label: meta?.label || key,
          icon: meta?.icon || '📊',
          value: formatSensorValue(key, avg),
          unit: meta?.unit || '',
        }
      })

      return {
        id: group.id,
        name: group.name,
        sensors,
        summaryItems,
      }
    })
    .filter(Boolean) as SensorGroupView[]
})

function formatSensorValue(field: string, value: number): string {
  if (['temperature', 'dew_point', 'rainfall'].includes(field)) return value.toFixed(1)
  if (['co2'].includes(field)) return Math.round(value).toLocaleString()
  return Math.round(value).toString()
}

async function loadResolved(groupId: string) {
  loadingResolvedFor.value[groupId] = true
  try {
    const res = await envConfigApi.getResolved(groupId)
    resolvedByGroup.value[groupId] = res.data
  } catch {
    resolvedByGroup.value[groupId] = null
  } finally {
    loadingResolvedFor.value[groupId] = false
  }
}

function isEnvConfigured(groupId: string): boolean {
  const resolved = resolvedByGroup.value[groupId]
  if (!resolved) return false
  return Object.values(resolved).some(v => v.source !== '미설정')
}

async function toggleGroup(groupId: string) {
  if (expandedGroups.value.has(groupId)) {
    expandedGroups.value.delete(groupId)
  } else {
    expandedGroups.value.add(groupId)
    if (!resolvedByGroup.value[groupId]) {
      await loadResolved(groupId)
    }
  }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([
      deviceStore.fetchDevices(),
      ...Object.keys(resolvedByGroup.value).map(gId => loadResolved(gId)),
    ])
    await deviceStore.fetchAllSensorStatuses()
  } finally {
    refreshing.value = false
  }
}

// WebSocket: sensor:update 수신 시 위젯 자동 갱신 (2초 디바운스)
const { on, off } = useWebSocket()
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function handleSensorUpdate() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    for (const gId of expandedGroups.value) {
      loadResolved(gId)
    }
    deviceStore.fetchAllSensorStatuses()
  }, 2000)
}

onMounted(async () => {
  await Promise.all([
    groupStore.fetchGroups(),
    deviceStore.fetchDevices(),
  ])
  await deviceStore.fetchAllSensorStatuses()
  for (const g of sensorGroups.value) {
    expandedGroups.value.add(g.id)
  }
  loading.value = false
  await Promise.all(sensorGroups.value.map(g => loadResolved(g.id)))
  on('sensor:update', handleSensorUpdate)
})

onUnmounted(() => {
  off('sensor:update', handleSensorUpdate)
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-header h2 { font-size: var(--font-size-display); font-weight: 700; color: var(--text-primary); }
.page-description { color: var(--text-secondary); font-size: var(--font-size-body); margin-top: 4px; }

.btn-refresh {
  padding: 12px 24px;
  background: var(--bg-hover);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  font-weight: 500;
  font-size: var(--font-size-label);
  cursor: pointer;
  transition: background 0.2s;
}
.btn-refresh:hover:not(:disabled) { background: var(--border-color); }
.btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

.loading-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}
.empty-state h3 { font-size: var(--font-size-title); color: var(--text-primary); margin-bottom: 8px; }
.empty-state p { font-size: var(--font-size-label); margin-bottom: 4px; }
.btn-cta {
  display: inline-block;
  margin-top: 16px;
  padding: 10px 24px;
  background: var(--accent);
  color: white;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  font-size: var(--font-size-label);
  transition: background 0.2s;
}
.btn-cta:hover { background: var(--accent-hover); }

.groups-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-section {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 14px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  cursor: pointer;
  transition: background 0.2s;
}
.group-header:hover { background: var(--bg-hover); }

.group-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.expand-icon { font-size: var(--font-size-caption); color: var(--text-muted); width: 16px; }

.group-title h3 {
  font-size: var(--font-size-subtitle);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.sensor-count {
  padding: 4px 12px;
  background: var(--bg-badge);
  border-radius: 20px;
  font-size: var(--font-size-label);
  color: var(--text-secondary);
  font-weight: 500;
}

.group-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-chip {
  padding: 6px 14px;
  background: var(--bg-hover);
  border-radius: 8px;
  font-size: var(--font-size-label);
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.group-widgets {
  padding: 0 20px 20px;
}

.env-loading {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: var(--font-size-label);
}

.env-unconfigured {
  text-align: center;
  padding: 32px 20px;
  color: var(--text-secondary);
  font-size: var(--font-size-label);
}
.env-unconfigured p {
  margin-bottom: 12px;
}

@media (max-width: 768px) {
  .page-container { padding: 16px; }
  .page-header h2 { font-size: var(--font-size-title); }
  .group-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .group-widgets { padding: 0 12px 16px; }
}

/* ─── A-05: 모바일 접이식 센서 뷰 ─── */
.mobile-metric-accordion {
  display: none;
}

@media (max-width: 768px) {
  .mobile-metric-accordion {
    display: block;
    margin-bottom: 12px;
  }
  /* 모바일에서 기존 ResolvedEnvPanel/GroupEnvScore 숨김 */
  .group-widgets :deep(.resolved-env-panel),
  .group-widgets :deep(.env-score-container) {
    display: none;
  }
}

.metric-accordion-item {
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  margin-bottom: 8px;
  overflow: hidden;
}

.metric-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: var(--bg-card, var(--color-surface));
  cursor: pointer;
  font-size: var(--font-size-label);
  text-align: left;
  color: var(--text-primary, var(--color-text-primary));
}

.metric-icon {
  font-size: var(--font-size-body);
  flex-shrink: 0;
}

.metric-label {
  font-weight: 500;
  min-width: 50px;
}

.metric-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

.metric-badge {
  font-size: var(--font-size-tiny);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.metric-badge.normal, .metric-badge.good {
  background: rgba(76, 175, 80, 0.12);
  color: var(--color-success, #4caf50);
}

.metric-badge.warning {
  background: rgba(255, 152, 0, 0.12);
  color: var(--color-warning, #ff9800);
}

.metric-badge.danger {
  background: rgba(244, 67, 54, 0.12);
  color: var(--color-error, #f44336);
}

.accordion-arrow {
  font-size: var(--font-size-tiny);
  transition: transform 0.2s;
  color: var(--text-muted, var(--color-text-disabled));
  flex-shrink: 0;
}

.accordion-arrow.open {
  transform: rotate(90deg);
}

.metric-detail {
  padding: 8px 14px 12px;
  background: var(--bg-secondary, #f8f9fa);
  border-top: 1px solid var(--border-light, rgba(0,0,0,0.06));
}

.metric-detail-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-caption);
  padding: 4px 0;
}

.detail-key {
  color: var(--text-secondary, var(--color-text-secondary));
}

.detail-val {
  font-weight: 500;
  color: var(--text-primary, var(--color-text-primary));
}

.detail-val.warning { color: var(--color-warning); }
.detail-val.danger { color: var(--color-error); }

/* Accordion transition */
.accordion-enter-active, .accordion-leave-active {
  transition: max-height 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.accordion-enter-from, .accordion-leave-to {
  max-height: 0;
  opacity: 0;
}
.accordion-enter-to, .accordion-leave-from {
  max-height: 200px;
  opacity: 1;
}
</style>
