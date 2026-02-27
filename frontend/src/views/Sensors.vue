<template>
  <div class="page-container">
    <header class="page-header">
      <div>
        <h2>환경 모니터링</h2>
        <p class="page-description">농장 환경을 종합적으로 확인합니다</p>
      </div>
      <button class="btn-refresh" @click="refreshAll" :disabled="refreshing">
        {{ refreshing ? '새로고침 중...' : '새로고침' }}
      </button>
    </header>

    <!-- 로딩 -->
    <div v-if="loading" class="loading-state">
      <p>센서 데이터를 불러오는 중...</p>
    </div>

    <!-- 센서 없음 -->
    <div v-else-if="sensorGroups.length === 0" class="empty-state">
      <h3>센서가 등록된 그룹이 없습니다</h3>
      <p>그룹에 센서를 추가한 후 이용하세요.</p>
    </div>

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
            <span class="sensor-count">{{ group.sensors.length }}개 센서</span>
          </div>
          <div class="group-summary">
            <span v-for="item in group.summaryItems" :key="item.label" class="summary-chip">
              {{ item.icon }} {{ item.value }}{{ item.unit }}
            </span>
          </div>
        </div>

        <!-- 환경 모니터링 위젯 (확장 시) -->
        <div v-if="expandedGroups.has(group.id)" class="group-widgets">
          <MonitoringWidgets
            :widget-data="widgetData"
            :weather-data="weatherData"
            :loading="widgetLoading"
          />
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
import { dashboardApi } from '@/api/dashboard.api'
import type { WidgetDataResponse } from '@/api/dashboard.api'
import MonitoringWidgets from '@/components/dashboard/MonitoringWidgets.vue'
import type { Device } from '@/types/device.types'

const groupStore = useGroupStore()
const deviceStore = useDeviceStore()
const loading = ref(true)
const refreshing = ref(false)
const expandedGroups = ref(new Set<string>())

// 환경 모니터링 위젯 데이터
const widgetData = ref<WidgetDataResponse | null>(null)
const weatherData = ref<{ temperature: number | null; humidity: number | null } | null>(null)
const widgetLoading = ref(false)

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

function toggleGroup(groupId: string) {
  if (expandedGroups.value.has(groupId)) {
    expandedGroups.value.delete(groupId)
  } else {
    expandedGroups.value.add(groupId)
  }
}

async function fetchWidgetData() {
  widgetLoading.value = true
  try {
    const [weatherRes, widgetRes] = await Promise.all([
      dashboardApi.getWeather().catch(() => null),
      dashboardApi.getWidgets().catch(() => ({ data: null })),
    ])
    if (weatherRes) {
      weatherData.value = weatherRes.data.weather
    }
    widgetData.value = widgetRes.data
  } finally {
    widgetLoading.value = false
  }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([
      deviceStore.fetchDevices(),
      fetchWidgetData(),
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
    fetchWidgetData()
    deviceStore.fetchAllSensorStatuses()
  }, 2000)
}

onMounted(async () => {
  await Promise.all([
    groupStore.fetchGroups(),
    deviceStore.fetchDevices(),
    fetchWidgetData(),
  ])
  await deviceStore.fetchAllSensorStatuses()
  for (const g of sensorGroups.value) {
    expandedGroups.value.add(g.id)
  }
  loading.value = false
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

.page-header h2 { font-size: calc(32px * var(--content-scale, 1)); font-weight: 700; color: var(--text-primary); }
.page-description { color: var(--text-secondary); font-size: calc(16px * var(--content-scale, 1)); margin-top: 4px; }

.btn-refresh {
  padding: 12px 24px;
  background: var(--bg-hover);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  font-weight: 500;
  font-size: calc(15px * var(--content-scale, 1));
  cursor: pointer;
  transition: background 0.2s;
}
.btn-refresh:hover:not(:disabled) { background: var(--border-color); }
.btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

.loading-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  font-size: calc(16px * var(--content-scale, 1));
}
.empty-state h3 { font-size: calc(22px * var(--content-scale, 1)); color: var(--text-primary); margin-bottom: 8px; }
.empty-state p { font-size: calc(16px * var(--content-scale, 1)); }

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

.expand-icon { font-size: calc(13px * var(--content-scale, 1)); color: var(--text-muted); width: 16px; }

.group-title h3 {
  font-size: calc(20px * var(--content-scale, 1));
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.sensor-count {
  padding: 4px 12px;
  background: var(--bg-badge);
  border-radius: 20px;
  font-size: calc(14px * var(--content-scale, 1));
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
  font-size: calc(15px * var(--content-scale, 1));
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.group-widgets {
  padding: 0 20px 20px;
}

@media (max-width: 768px) {
  .page-container { padding: 16px; }
  .page-header h2 { font-size: calc(24px * var(--content-scale, 1)); }
  .group-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .group-widgets { padding: 0 12px 16px; }
}
</style>
