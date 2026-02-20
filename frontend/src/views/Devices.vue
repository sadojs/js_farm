<template>
  <div class="page-container">
    <header class="page-header">
      <div>
        <h2>장비 관리</h2>
        <p class="page-description">농장 장비와 센서를 관리합니다</p>
      </div>
      <div class="header-actions">
        <button class="btn-outline" @click="handleTuyaSync" :disabled="syncing">
          {{ syncing ? '동기화 중...' : 'Tuya 동기화' }}
        </button>
        <button class="btn-primary" @click="showRegistrationModal = true">+ 장비 추가</button>
      </div>
    </header>

    <!-- 검색 + 탭 필터 -->
    <div class="filter-bar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="장비 이름으로 검색..."
          class="search-input"
        />
      </div>
      <div class="tab-filter">
        <button class="tab" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">
          전체 ({{ deviceStore.devices.length }})
        </button>
        <button class="tab" :class="{ active: activeTab === 'actuator' }" @click="activeTab = 'actuator'">
          장비 ({{ actuatorDevices.length }})
        </button>
        <button class="tab" :class="{ active: activeTab === 'sensor' }" @click="activeTab = 'sensor'">
          센서 ({{ sensorDevices.length }})
        </button>
      </div>
    </div>

    <!-- 로딩 상태 -->
    <div v-if="deviceStore.loading" class="loading-state">
      <p>장비 목록을 불러오는 중...</p>
    </div>

    <!-- 장비 없음 -->
    <div v-else-if="filteredDevices.length === 0" class="empty-state">
      <div class="empty-icon">📭</div>
      <h3>{{ searchQuery ? '검색 결과가 없습니다' : '등록된 장비가 없습니다' }}</h3>
      <p>{{ searchQuery ? '다른 검색어를 입력해보세요.' : 'Tuya Cloud에서 장비를 가져와 등록하세요.' }}</p>
      <button v-if="!searchQuery" class="btn-primary" @click="showRegistrationModal = true">+ 장비 추가</button>
    </div>

    <!-- 장비 목록 -->
    <div v-else class="devices-grid">
      <div
        v-for="device in filteredDevices"
        :key="device.id"
        class="device-card"
      >
        <!-- 카드 상단 -->
        <div class="card-top">
          <span :class="['status-dot', device.online ? 'online' : 'offline']"></span>
          <span :class="['type-badge', device.deviceType === 'sensor' ? 'sensor' : 'actuator']">
            {{ device.deviceType === 'sensor' ? '센서' : '장비' }}
          </span>
          <div class="card-title">
            <h4>{{ device.name }}</h4>
            <span class="card-category">{{ getCategoryLabel(device.category) }}</span>
          </div>
        </div>

        <!-- 센서: 큰 값 표시 -->
        <div v-if="device.deviceType === 'sensor'" class="card-sensor-value">
          <template v-if="device.sensorData && Object.keys(device.sensorData).length > 0">
            <div v-for="(val, key) in getTopSensorData(device.sensorData)" :key="key" class="sensor-big-value">
              <span class="big-number">{{ formatSensorVal(key as string, val as number) }}</span>
              <span class="big-unit">{{ SENSOR_META[key as string]?.unit || '' }}</span>
              <span class="big-label">{{ SENSOR_META[key as string]?.label || key }}</span>
            </div>
          </template>
          <div v-else-if="device.online" class="sensor-loading">데이터 로딩 중...</div>
          <div v-else class="sensor-offline">오프라인</div>
        </div>

        <!-- 장비: 토글 스위치 -->
        <div v-else class="card-control">
          <div class="toggle-row" :class="{ disabled: !device.online }">
            <span class="toggle-label">
              {{ device.switchState === true ? '가동중' : device.switchState === false ? '정지' : '상태 미확인' }}
            </span>
            <label class="toggle-switch" @click.prevent="device.online && handleControl(device.id, !device.switchState)">
              <input type="checkbox" :checked="device.switchState === true" :disabled="!device.online || controllingId === device.id" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- 카드 하단 -->
        <div class="card-footer">
          <span class="last-seen">{{ formatLastSeen(device.lastSeen) }}</span>
          <div class="card-actions">
            <button class="btn-icon-delete" @click="handleRemoveDevice(device.id)" aria-label="삭제">삭제</button>
          </div>
        </div>
      </div>
    </div>

    <DeviceRegistration
      :is-open="showRegistrationModal"
      @close="showRegistrationModal = false"
      @registered="handleDeviceRegistered"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DeviceRegistration from '@/components/devices/DeviceRegistration.vue'
import { useDeviceStore } from '@/stores/device.store'
import { useConfirm } from '@/composables/useConfirm'
import type { Device } from '@/types/device.types'

const deviceStore = useDeviceStore()
const { confirm } = useConfirm()
const showRegistrationModal = ref(false)
const syncing = ref(false)
const searchQuery = ref('')
const activeTab = ref<'all' | 'actuator' | 'sensor'>('all')

const sensorDevices = computed(() => deviceStore.sensorDevices)
const actuatorDevices = computed(() => deviceStore.actuatorDevices)

const filteredDevices = computed(() => {
  let list: Device[] = []
  if (activeTab.value === 'all') list = deviceStore.devices
  else if (activeTab.value === 'sensor') list = sensorDevices.value
  else list = actuatorDevices.value

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(d => d.name.toLowerCase().includes(q))
  }
  return list
})

const SENSOR_META: Record<string, { label: string; icon: string; unit: string }> = {
  temperature: { label: '온도', icon: '🌡️', unit: '°C' },
  humidity: { label: '습도', icon: '💧', unit: '%' },
  co2: { label: 'CO2', icon: '🌫️', unit: 'ppm' },
  rainfall: { label: '강우량', icon: '🌧️', unit: 'mm' },
  uv: { label: 'UV', icon: '☀️', unit: '' },
  dew_point: { label: '이슬점', icon: '💦', unit: '°C' },
  light: { label: '조도', icon: '💡', unit: 'lux' },
  soil_moisture: { label: '토양수분', icon: '🌱', unit: '%' },
  ph: { label: 'PH', icon: '⚗️', unit: '' },
  ec: { label: 'EC', icon: '⚡', unit: 'mS/cm' },
}

function getTopSensorData(sensorData: Record<string, number | null | undefined>): Record<string, number> {
  const entries = Object.entries(sensorData)
    .filter(([k, v]) => v != null && k in SENSOR_META) as [string, number][]
  return Object.fromEntries(entries)
}

const formatSensorVal = (field: string, value: number): string => {
  if (value == null) return '-'
  if (['temperature', 'dew_point', 'ph', 'ec', 'rainfall'].includes(field)) return value.toFixed(1)
  if (['co2', 'light'].includes(field)) return Math.round(value).toLocaleString()
  return Math.round(value).toString()
}

const getCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    'wk': '환풍기', 'fs': '환풍기',
    'cl': '개폐기', 'mc': '개폐기',
    'dj': '조명', 'dd': '조명',
    'bh': '관수', 'sfkzq': '관수',
    'wsdcg': '온습도계', 'co2bj': 'CO2센서', 'ldcg': '토양센서',
    'mcs': '복합센서', 'ywbj': '우량계', 'pm25': '미세먼지',
  }
  return labels[category] || category
}

const formatLastSeen = (lastSeen?: string) => {
  if (!lastSeen) return '-'
  const date = new Date(lastSeen)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return `${Math.floor(diffHour / 24)}일 전`
}

onMounted(async () => {
  await deviceStore.fetchDevices()
  deviceStore.fetchAllActuatorStatuses()
  deviceStore.fetchAllSensorStatuses()
})

const handleDeviceRegistered = () => {
  deviceStore.fetchDevices()
}

const controllingId = ref<string | null>(null)

const handleControl = async (deviceId: string, turnOn: boolean) => {
  controllingId.value = deviceId
  try {
    await deviceStore.controlDevice(deviceId, [{ code: 'switch_1', value: turnOn }])
    const device = deviceStore.devices.find(d => d.id === deviceId)
    if (device) device.switchState = turnOn
  } catch (err: any) {
    console.error('장비 제어 실패:', err)
    alert('장비 제어에 실패했습니다.')
  } finally {
    controllingId.value = null
  }
}

const handleRemoveDevice = async (id: string) => {
  const ok = await confirm({
    title: '장비 삭제',
    message: '이 장비를 삭제하시겠습니까?',
    confirmText: '삭제',
    variant: 'danger',
  })
  if (!ok) return
  await deviceStore.removeDevice(id)
}

const handleTuyaSync = async () => {
  syncing.value = true
  try {
    await deviceStore.fetchDevices()
    await Promise.all([
      deviceStore.fetchAllActuatorStatuses(),
      deviceStore.fetchAllSensorStatuses(),
    ])
  } finally {
    syncing.value = false
  }
}
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

.page-header h2 {
  font-size: calc(32px * var(--content-scale, 1));
  font-weight: 700;
  color: var(--text-primary);
}

.page-description {
  color: var(--text-secondary);
  font-size: calc(16px * var(--content-scale, 1));
  margin-top: 4px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn-primary {
  padding: 14px 28px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: calc(16px * var(--content-scale, 1));
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover { background: var(--accent-hover); }

.btn-outline {
  padding: 12px 24px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-weight: 500;
  font-size: calc(15px * var(--content-scale, 1));
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.btn-outline:hover { border-color: var(--accent); background: var(--accent-bg); }
.btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }

/* 검색 + 탭 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 10px;
  padding: 0 14px;
  flex: 1;
  min-width: 200px;
  max-width: 360px;
}

.search-icon {
  font-size: calc(16px * var(--content-scale, 1));
  color: var(--text-muted);
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  padding: 12px 0;
  font-size: calc(15px * var(--content-scale, 1));
  background: none;
}

.tab-filter {
  display: flex;
  gap: 4px;
  background: var(--bg-badge);
  border-radius: 10px;
  padding: 4px;
}

.tab {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: none;
  font-size: calc(14px * var(--content-scale, 1));
  font-weight: 500;
  color: var(--text-link);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  white-space: nowrap;
}
.tab.active {
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: var(--shadow-card);
}

.loading-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  font-size: calc(16px * var(--content-scale, 1));
}
.empty-icon { font-size: 64px; margin-bottom: 16px; }
.empty-state h3 { font-size: calc(22px * var(--content-scale, 1)); color: var(--text-primary); margin-bottom: 8px; }
.empty-state p { margin-bottom: 24px; font-size: calc(16px * var(--content-scale, 1)); }

/* 장비 그리드 */
.devices-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.device-card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 14px;
  padding: 20px;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 카드 상단 */
.card-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.online { background: var(--toggle-on); }
.status-dot.offline { background: var(--border-color); }

.type-badge {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: calc(14px * var(--content-scale, 1));
  font-weight: 600;
  flex-shrink: 0;
}
.type-badge.actuator { background: var(--bg-actuator); color: var(--accent); }
.type-badge.sensor { background: var(--sensor-bg); color: var(--sensor-accent); }

.card-title {
  flex: 1;
  min-width: 0;
}

.card-title h4 {
  font-size: calc(18px * var(--content-scale, 1));
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-category {
  font-size: calc(13px * var(--content-scale, 1));
  color: var(--text-muted);
}

/* 센서 값 표시 */
.card-sensor-value {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
  padding: 12px;
  background: var(--sensor-value-bg);
  border-radius: 10px;
}

.sensor-big-value {
  text-align: center;
  padding: 4px 0;
}

.big-number {
  font-size: calc(22px * var(--content-scale, 1));
  font-weight: 700;
  color: var(--sensor-accent);
  font-variant-numeric: tabular-nums;
}

.big-unit {
  font-size: calc(12px * var(--content-scale, 1));
  color: var(--text-muted);
  margin-left: 1px;
}

.big-label {
  display: block;
  font-size: calc(12px * var(--content-scale, 1));
  color: var(--text-muted);
  margin-top: 2px;
}

.sensor-loading, .sensor-offline {
  font-size: calc(14px * var(--content-scale, 1));
  color: var(--text-muted);
  text-align: center;
  padding: 8px;
}

/* 장비 토글 */
.card-control {
  padding: 12px;
  background: var(--bg-actuator);
  border-radius: 10px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-row.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.toggle-label {
  font-size: calc(15px * var(--content-scale, 1));
  font-weight: 600;
  color: var(--accent);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 28px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--toggle-off);
  border-radius: 28px;
  transition: background 0.3s;
}

.toggle-slider:before {
  content: '';
  position: absolute;
  height: 22px;
  width: 22px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

input:checked + .toggle-slider {
  background: var(--toggle-on);
}

input:checked + .toggle-slider:before {
  transform: translateX(24px);
}

/* 카드 하단 */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
}

.last-seen {
  font-size: calc(13px * var(--content-scale, 1));
  color: var(--text-muted);
}

.btn-icon-delete {
  padding: 6px 14px;
  background: var(--bg-card);
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: 6px;
  font-size: calc(13px * var(--content-scale, 1));
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.btn-icon-delete:hover { background: var(--danger); color: white; }

@media (max-width: 768px) {
  .page-container { padding: 16px; }
  .page-header h2 { font-size: calc(24px * var(--content-scale, 1)); }

  .header-actions { width: 100%; }
  .header-actions .btn-outline,
  .header-actions .btn-primary { flex: 1; text-align: center; }

  .filter-bar { flex-direction: column; gap: 12px; }
  .search-box { max-width: 100%; }
  .tab-filter { width: 100%; }
  .tab { flex: 1; text-align: center; }

  .devices-grid { grid-template-columns: 1fr; }
}
</style>
