<template>
  <div class="page-container">
    <header class="page-header">
      <div>
        <h2>리포트</h2>
        <p class="page-description">농장 운영 데이터를 분석합니다</p>
      </div>
    </header>

    <!-- 필터 영역 -->
    <div class="filter-section">
      <div class="filter-row">
        <div class="filter-group">
          <label>그룹 선택</label>
          <select v-model="selectedGroup" class="filter-select">
            <option value="">전체 그룹</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>하우스동 선택</label>
          <select v-model="selectedHouse" class="filter-select" :disabled="!selectedGroup">
            <option value="">전체 하우스</option>
            <option v-for="house in filteredHouses" :key="house.id" :value="house.id">
              {{ house.name }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>센서 타입</label>
          <select v-model="selectedSensorType" class="filter-select">
            <option v-for="st in sensorTypeOptions" :key="st.value" :value="st.value">
              {{ st.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- 기간 선택 버튼 그룹 -->
      <div class="period-row">
        <label>기간 선택</label>
        <div class="period-buttons">
          <button
            v-for="opt in periodOptions"
            :key="opt.value"
            class="period-btn"
            :class="{ active: dateRange === opt.value }"
            @click="selectPeriod(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <div v-if="dateRange === 'custom'" class="custom-dates">
          <input v-model="startDate" type="date" class="filter-input" />
          <span class="date-separator">~</span>
          <input v-model="endDate" type="date" class="filter-input" />
          <button class="btn-primary btn-sm" @click="loadAllData" :disabled="loadingData">조회</button>
        </div>
      </div>

      <!-- 다운로드 -->
      <div class="download-row">
        <span class="download-label">다운로드</span>
        <button class="btn-download csv" @click="exportToCSV">CSV 다운로드</button>
        <button class="btn-download pdf" @click="downloadReport">PDF 다운로드</button>
      </div>
    </div>

    <!-- 로딩 -->
    <div v-if="loadingData" class="loading-state">데이터를 불러오는 중...</div>

    <template v-else-if="hourlyData.length > 0 || actuatorData.length > 0">
      <!-- 통계 카드 -->
      <div class="stats-grid">
        <div class="stat-card" v-for="st in displayStats" :key="st.type">
          <div class="stat-label">평균 {{ st.label }}</div>
          <div class="stat-value sensor-stat">{{ st.avg }}<span class="stat-unit">{{ st.unit }}</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">장비 가동 시간</div>
          <div class="stat-value actuator">{{ statistics.actuatorHours }}<span class="stat-unit">시간</span></div>
        </div>
      </div>

      <!-- 센서 데이터 추이 차트 -->
      <div class="chart-card">
        <h3 class="chart-title">{{ selectedSensorLabel }} 추이</h3>
        <div class="chart-container">
          <Line v-if="sensorChartData" :data="sensorChartData" :options="lineChartOptions" />
        </div>
      </div>

      <!-- 장비 가동 현황 차트 -->
      <div class="chart-card">
        <h3 class="chart-title">장비 가동 현황</h3>
        <div class="chart-container">
          <Bar v-if="actuatorChartData" :data="actuatorChartData" :options="barChartOptions" />
        </div>
      </div>

      <!-- 상세 데이터 테이블 -->
      <div class="chart-card">
        <h3 class="chart-title">상세 데이터</h3>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>{{ selectedSensorLabel }} ({{ selectedSensorUnit }})</th>
                <th>가동 장비</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in tableData" :key="i">
                <td>{{ row.time }}</td>
                <td>{{ row.sensorValue }}</td>
                <td>{{ row.activeDevices }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="tableData.length === 0" class="empty-state">
            <p>조회된 데이터가 없습니다</p>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="empty-state">
      <p>조회된 데이터가 없습니다. 기간을 선택하여 조회해주세요.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { reportApi } from '../api/report.api'
import { useGroupStore } from '../stores/group.store'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const groupStore = useGroupStore()

// 필터 상태
const selectedGroup = ref('')
const selectedHouse = ref('')
const selectedSensorType = ref('temperature')

const sensorTypeOptions = [
  { value: 'temperature', label: '온도', unit: '°C' },
  { value: 'humidity', label: '습도', unit: '%' },
  { value: 'co2', label: 'CO2', unit: 'ppm' },
  { value: 'rainfall', label: '강우량', unit: 'mm' },
  { value: 'uv', label: 'UV', unit: '' },
  { value: 'dew_point', label: '이슬점', unit: '°C' },
]
const dateRange = ref('today')
const startDate = ref('')
const endDate = ref('')
const loadingData = ref(false)

const groups = computed(() => groupStore.groups)
const filteredHouses = computed(() => {
  if (!selectedGroup.value) return []
  const group = groupStore.groups.find(g => g.id === selectedGroup.value)
  return group?.houses || []
})

const periodOptions = [
  { value: 'today', label: '1일' },
  { value: 'week', label: '7일' },
  { value: 'month', label: '1개월' },
  { value: 'custom', label: '기간 선택' },
]

// 데이터
const hourlyData = ref<any[]>([])
const actuatorData = ref<any[]>([])
const statsData = ref<any[]>([])

const selectedSensorLabel = computed(() => {
  const opt = sensorTypeOptions.find(o => o.value === selectedSensorType.value)
  return opt ? opt.label : selectedSensorType.value
})

const selectedSensorUnit = computed(() => {
  const opt = sensorTypeOptions.find(o => o.value === selectedSensorType.value)
  return opt ? opt.unit : ''
})

const displayStats = computed(() => {
  const types = selectedSensorType.value === 'temperature'
    ? ['temperature', 'humidity']
    : [selectedSensorType.value]
  return types.map(t => {
    const opt = sensorTypeOptions.find(o => o.value === t)
    const stat = statsData.value.find((s: any) => s.sensor_type === t)
    return {
      type: t,
      label: opt?.label || t,
      unit: opt?.unit || '',
      avg: stat ? Number(stat.avg_value).toFixed(1) : '-',
    }
  })
})

const statistics = computed(() => ({
  actuatorHours: actuatorData.value.length > 0
    ? actuatorData.value.reduce((sum: number, d: any) => sum + Number(d.active_devices || 0), 0)
    : '-',
}))

const CHART_COLORS: Record<string, { border: string; bg: string }> = {
  temperature: { border: '#4A90D9', bg: 'rgba(74, 144, 217, 0.1)' },
  humidity: { border: '#4caf50', bg: 'rgba(76, 175, 80, 0.1)' },
  co2: { border: '#9c27b0', bg: 'rgba(156, 39, 176, 0.1)' },
  rainfall: { border: '#2196f3', bg: 'rgba(33, 150, 243, 0.1)' },
  uv: { border: '#9c27b0', bg: 'rgba(156, 39, 176, 0.1)' },
  dew_point: { border: '#00bcd4', bg: 'rgba(0, 188, 212, 0.1)' },
}

// 차트 데이터
const sensorChartData = computed(() => {
  const sType = selectedSensorType.value
  const filtered = hourlyData.value.filter((d: any) => d.sensor_type === sType)
  const labels = filtered.map((d: any) => formatHour(d.time))
  const colors = CHART_COLORS[sType] || { border: '#666', bg: 'rgba(100,100,100,0.1)' }

  return {
    labels,
    datasets: [{
      label: `${selectedSensorLabel.value} (${selectedSensorUnit.value})`,
      data: filtered.map((d: any) => Number(d.avg_value)),
      borderColor: colors.border,
      backgroundColor: colors.bg,
      tension: 0.4,
      fill: true,
    }],
  }
})

const lineChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: { legend: { position: 'bottom' as const } },
  scales: {
    y: { type: 'linear' as const, position: 'left' as const, title: { display: true, text: selectedSensorUnit.value } },
  },
}))

const actuatorChartData = computed(() => {
  const labels = actuatorData.value.map((d: any) => formatHour(d.time))
  return {
    labels,
    datasets: [{
      label: '가동 장비 수',
      data: actuatorData.value.map((d: any) => Number(d.active_devices)),
      backgroundColor: 'rgba(103, 58, 183, 0.7)',
      borderRadius: 4,
    }],
  }
})

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom' as const } },
  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
}

// 테이블 데이터
const tableData = computed(() => {
  const sType = selectedSensorType.value
  const sensorMap = new Map<string, number>()
  const actMap = new Map<string, number>()

  hourlyData.value.forEach((d: any) => {
    const key = formatHour(d.time)
    if (d.sensor_type === sType) sensorMap.set(key, Number(d.avg_value))
  })
  actuatorData.value.forEach((d: any) => {
    actMap.set(formatHour(d.time), Number(d.active_devices))
  })

  const allTimes = [...new Set([...sensorMap.keys(), ...actMap.keys()])].sort()
  return allTimes.map(time => ({
    time,
    sensorValue: sensorMap.has(time) ? sensorMap.get(time)!.toFixed(1) : '-',
    activeDevices: actMap.get(time) ?? '-',
  }))
})

function formatHour(dateStr: string) {
  const d = new Date(dateStr)
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

function selectPeriod(value: string) {
  dateRange.value = value
  if (value !== 'custom') {
    updateDateRange()
    loadAllData()
  }
}

function updateDateRange() {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  switch (dateRange.value) {
    case 'today':
      startDate.value = fmt(today)
      endDate.value = fmt(today)
      break
    case 'week':
      startDate.value = fmt(new Date(today.getTime() - 7 * 86400000))
      endDate.value = fmt(today)
      break
    case 'month':
      startDate.value = fmt(new Date(today.getTime() - 30 * 86400000))
      endDate.value = fmt(today)
      break
  }
}

async function loadAllData() {
  loadingData.value = true
  try {
    const baseParams = {
      startDate: startDate.value,
      endDate: endDate.value + 'T23:59:59',
      groupId: selectedGroup.value || undefined,
      houseId: selectedHouse.value || undefined,
    }

    const [statsRes, hourlyRes, actRes] = await Promise.all([
      reportApi.getStatistics({ ...baseParams, sensorType: undefined }),
      reportApi.getHourlyData({ ...baseParams, sensorType: undefined }),
      reportApi.getActuatorStats({ startDate: baseParams.startDate, endDate: baseParams.endDate, groupId: baseParams.groupId }),
    ])

    statsData.value = statsRes.data?.statistics || []
    hourlyData.value = hourlyRes.data || []
    actuatorData.value = actRes.data || []
  } catch (err) {
    console.error('데이터 조회 실패:', err)
    statsData.value = []
    hourlyData.value = []
    actuatorData.value = []
  } finally {
    loadingData.value = false
  }
}

async function exportToCSV() {
  try {
    const { data: blob } = await reportApi.exportCsv({
      startDate: startDate.value,
      endDate: endDate.value,
      groupId: selectedGroup.value || undefined,
      houseId: selectedHouse.value || undefined,
      sensorType: selectedSensorType.value,
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sensor_report_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('CSV 다운로드 실패:', err)
  }
}

async function downloadReport() {
  try {
    const { data: blob } = await reportApi.exportPdf({
      startDate: startDate.value,
      endDate: endDate.value,
      groupId: selectedGroup.value || undefined,
      houseId: selectedHouse.value || undefined,
      sensorType: selectedSensorType.value,
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `report_${new Date().toISOString().split('T')[0]}.pdf`
    link.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('PDF 다운로드 실패:', err)
    alert('PDF 다운로드에 실패했습니다.')
  }
}

watch([selectedGroup, selectedHouse, selectedSensorType], () => {
  if (startDate.value && endDate.value) loadAllData()
})

onMounted(async () => {
  if (groupStore.groups.length === 0) await groupStore.fetchGroups()
  updateDateRange()
  loadAllData()
})
</script>

<style scoped>
.page-container { padding: 24px; max-width: 1200px; margin: 0 auto; }

.page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
}
.page-header h2 { font-size: calc(28px * var(--content-scale, 1)); font-weight: 700; color: var(--text-primary); }
.page-description { color: var(--text-secondary); font-size: calc(14px * var(--content-scale, 1)); margin-top: 4px; }

/* 필터 */
.filter-section {
  background: var(--bg-card); border: 1px solid var(--border-card);
  border-radius: 14px; padding: 20px; box-shadow: var(--shadow-card); margin-bottom: 24px;
}
.filter-row { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 150px; }
.filter-group label, .period-row > label, .download-label {
  font-size: calc(14px * var(--content-scale, 1)); font-weight: 600; color: var(--text-secondary);
}
.filter-select, .filter-input {
  padding: 12px 14px; border: 1px solid var(--border-input); border-radius: 8px;
  font-size: calc(15px * var(--content-scale, 1)); background: var(--bg-input); color: var(--text-primary);
}
.filter-select:focus, .filter-input:focus { outline: none; border-color: var(--accent); }

/* 기간 버튼 */
.period-row { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
.period-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.period-btn {
  padding: 10px 24px; border: 1px solid var(--border-input); border-radius: 8px;
  background: var(--bg-input); color: var(--text-primary); cursor: pointer;
  font-size: calc(15px * var(--content-scale, 1)); font-weight: 500; transition: all 0.2s;
}
.period-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
.period-btn:hover:not(.active) { border-color: var(--accent); background: var(--accent-bg); }

.custom-dates { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.date-separator { color: var(--text-muted); font-weight: 500; }

/* 다운로드 */
.download-row { display: flex; align-items: center; gap: 12px; }
.btn-download {
  padding: 10px 20px; border-radius: 8px; font-size: calc(14px * var(--content-scale, 1));
  font-weight: 500; cursor: pointer; transition: all 0.2s;
}
.btn-download.csv {
  background: var(--bg-secondary); color: var(--text-primary);
  border: 1px solid var(--border-color);
}
.btn-download.csv:hover { border-color: var(--accent); }
.btn-download.pdf {
  background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger);
}
.btn-download.pdf:hover { opacity: 0.85; }

.btn-primary { padding: 12px 24px; background: var(--accent); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: calc(15px * var(--content-scale, 1)); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-sm { padding: 10px 16px; }

/* 통계 카드 */
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
.stat-card {
  background: var(--bg-card); border: 1px solid var(--border-card);
  border-radius: 14px; padding: 20px; box-shadow: var(--shadow-card);
}
.stat-label { font-size: calc(14px * var(--content-scale, 1)); color: var(--text-muted); font-weight: 500; margin-bottom: 8px; }
.stat-value {
  font-size: calc(32px * var(--content-scale, 1)); font-weight: 700;
  font-variant-numeric: tabular-nums; line-height: 1.2;
}
.stat-value.sensor-stat { color: var(--accent); }
.stat-value.actuator { color: var(--text-primary); }
.stat-unit { font-size: calc(16px * var(--content-scale, 1)); font-weight: 500; color: var(--text-muted); margin-left: 4px; }

/* 차트 카드 */
.chart-card {
  background: var(--bg-card); border: 1px solid var(--border-card);
  border-radius: 14px; padding: 20px; box-shadow: var(--shadow-card); margin-bottom: 24px;
}
.chart-title { font-size: calc(18px * var(--content-scale, 1)); font-weight: 600; color: var(--text-primary); margin: 0 0 16px; }
.chart-container { height: 320px; position: relative; }

/* 테이블 */
.table-container { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table thead { background: var(--bg-secondary); }
.data-table th {
  padding: 14px 16px; text-align: left; font-weight: 600; color: var(--text-primary);
  font-size: calc(14px * var(--content-scale, 1)); border-bottom: 2px solid var(--border-input);
}
.data-table td {
  padding: 12px 16px; border-bottom: 1px solid var(--border-light);
  font-size: calc(14px * var(--content-scale, 1)); color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.data-table tbody tr:hover { background: var(--bg-hover); }

.loading-state, .empty-state {
  text-align: center; padding: 60px 20px; color: var(--text-secondary); font-size: calc(16px * var(--content-scale, 1));
}

@media (max-width: 768px) {
  .page-container { padding: 16px; }
  .stats-grid { grid-template-columns: 1fr; }
  .chart-container { height: 250px; }
  .filter-row { flex-direction: column; }
  .period-buttons { flex-direction: column; }
  .period-btn { text-align: center; }
}
</style>
