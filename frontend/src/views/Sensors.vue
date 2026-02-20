<template>
  <div class="page-container">
    <header class="page-header">
      <div>
        <h2>실시간 모니터링</h2>
        <p class="page-description">센서 데이터를 실시간으로 확인합니다</p>
      </div>
      <button class="btn-refresh" @click="refreshAll" :disabled="refreshing">
        {{ refreshing ? '새로고침 중...' : '새로고침' }}
      </button>
    </header>

    <!-- 정보 배너 -->
    <div class="info-banner">
      센서 데이터가 자동으로 업데이트됩니다
    </div>

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

        <!-- 센서 카드 (확장 시) -->
        <div v-if="expandedGroups.has(group.id)" class="sensors-grid">
          <div
            v-for="sensor in group.sensors"
            :key="sensor.id"
            class="sensor-card"
            :class="{ offline: !sensor.online }"
          >
            <div class="sensor-card-top">
              <span class="sensor-name">{{ sensor.name }}</span>
              <span :class="['sensor-status', sensor.online ? 'online' : 'offline']">
                {{ sensor.online ? '정상' : '오프라인' }}
              </span>
            </div>

            <div v-if="sensor.sensorData && Object.keys(sensor.sensorData).length > 0" class="sensor-values">
              <div
                v-for="key in DISPLAY_FIELDS.filter(f => sensor.sensorData && f in sensor.sensorData)"
                :key="key"
                class="sensor-value-block"
              >
                <span class="value-number">{{ formatSensorValue(key, sensor.sensorData[key] as number) }}</span>
                <span class="value-unit">{{ SENSOR_FIELD_META[key]?.unit || '' }}</span>
                <span class="value-label">{{ SENSOR_FIELD_META[key]?.label || key }}</span>
              </div>
            </div>
            <div v-else-if="sensor.online" class="sensor-values-empty">
              데이터 로딩 중...
            </div>
            <div v-else class="sensor-values-empty">
              오프라인
            </div>

            <div class="sensor-card-footer">
              업데이트: {{ formatLastSeen(sensor.lastSeen) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGroupStore } from '@/stores/group.store'
import { useDeviceStore } from '@/stores/device.store'
import type { Device } from '@/types/device.types'

const groupStore = useGroupStore()
const deviceStore = useDeviceStore()
const loading = ref(true)
const refreshing = ref(false)
const expandedGroups = ref(new Set<string>())

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

const formatLastSeen = (lastSeen?: string) => {
  if (!lastSeen) return ''
  const date = new Date(lastSeen)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return `${Math.floor(diffHour / 24)}일 전`
}

async function refreshAll() {
  refreshing.value = true
  try {
    await deviceStore.fetchDevices()
    await deviceStore.fetchAllSensorStatuses()
  } finally {
    refreshing.value = false
  }
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

.info-banner {
  background: var(--bg-info-banner);
  color: var(--text-info-banner);
  padding: 14px 18px;
  border-radius: 10px;
  font-size: calc(15px * var(--content-scale, 1));
  font-weight: 500;
  margin-bottom: 24px;
}

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

.sensors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
  padding: 0 20px 20px;
}

.sensor-card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sensor-card.offline {
  opacity: 0.5;
  border-color: var(--border-color);
}

.sensor-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sensor-name {
  font-size: calc(17px * var(--content-scale, 1));
  font-weight: 600;
  color: var(--text-primary);
}

.sensor-status {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: calc(14px * var(--content-scale, 1));
  font-weight: 600;
}
.sensor-status.online { background: var(--accent-bg); color: var(--accent); }
.sensor-status.offline { background: var(--bg-hover); color: var(--text-muted); }

.sensor-values {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
  padding: 8px 0;
}

.sensor-value-block {
  text-align: center;
  padding: 4px 0;
}

.value-number {
  font-size: calc(22px * var(--content-scale, 1));
  font-weight: 700;
  color: var(--sensor-accent);
  font-variant-numeric: tabular-nums;
}

.value-unit {
  font-size: calc(12px * var(--content-scale, 1));
  color: var(--text-muted);
  font-weight: 500;
  margin-left: 1px;
}

.value-label {
  display: block;
  font-size: calc(12px * var(--content-scale, 1));
  color: var(--text-muted);
  margin-top: 2px;
}

.sensor-values-empty {
  font-size: calc(15px * var(--content-scale, 1));
  color: var(--text-muted);
  text-align: center;
  padding: 12px;
}

.sensor-card-footer {
  font-size: calc(14px * var(--content-scale, 1));
  color: var(--text-muted);
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
}

@media (max-width: 768px) {
  .page-container { padding: 16px; }
  .page-header h2 { font-size: calc(24px * var(--content-scale, 1)); }
  .sensors-grid { grid-template-columns: 1fr; }
  .group-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .value-number { font-size: calc(18px * var(--content-scale, 1)); }
}
</style>
