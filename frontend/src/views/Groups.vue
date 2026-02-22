<template>
  <div class="page-container">
    <header class="page-header">
      <div>
        <h2>그룹 관리</h2>
        <p class="page-description">장비를 그룹으로 묶어 관리합니다</p>
      </div>
      <div class="header-actions">
        <button class="btn-outline" @click="handleTuyaSync" :disabled="syncing">
          {{ syncing ? '동기화 중...' : 'Tuya 동기화' }}
        </button>
        <button class="btn-primary" @click="showGroupCreationModal = true">+ 그룹 추가</button>
      </div>
    </header>

    <div v-if="loading" class="loading-state">그룹 목록을 불러오는 중...</div>

    <div v-else-if="groups.length === 0" class="empty-state">
      <p>등록된 그룹이 없습니다.</p>
      <button class="btn-primary" @click="showGroupCreationModal = true">첫 번째 그룹 만들기</button>
    </div>

    <div v-else class="groups-list">
      <div v-for="group in groups" :key="group.id" class="group-card">
        <!-- 그룹 헤더 -->
        <div class="group-header">
          <div class="group-title">
            <h3>{{ group.name }}</h3>
            <p v-if="group.description" class="group-desc">{{ group.description }}</p>
          </div>
          <div class="group-header-actions">
            <span class="device-count-badge">{{ getGroupSensors(group).length + getGroupActuators(group).length + getGroupOpenerGroups(group).length }}개 장비</span>
            <button class="btn-icon" @click="openAddDeviceModal(group)" aria-label="장비 추가">+</button>
            <button class="btn-icon danger" @click="deleteGroup(group)" aria-label="삭제">🗑</button>
            <button class="btn-icon" @click="toggleCollapse(group.id)" :aria-label="collapsedGroups.has(group.id) ? '펼치기' : '접기'">
              {{ collapsedGroups.has(group.id) ? '▶' : '▼' }}
            </button>
          </div>
        </div>

        <!-- 그룹 내 장비 (접기/펼치기) -->
        <div v-if="!collapsedGroups.has(group.id)" class="group-body">
          <!-- 장비 없음 -->
          <div v-if="!group.devices || group.devices.length === 0" class="no-devices">
            <p>할당된 장비가 없습니다</p>
            <button class="btn-sm" @click="openAddDeviceModal(group)">+ 장비 추가</button>
          </div>

          <!-- 센서 목록 -->
          <template v-if="getGroupSensors(group).length > 0">
            <div class="section-label sensor">센서 ({{ getGroupSensors(group).length }})</div>
            <div class="device-sub-grid">
              <div v-for="device in getGroupSensors(group)" :key="device.id" class="sub-card sensor">
                <div class="sub-card-top">
                  <span :class="['status-dot', device.online ? 'online' : 'offline']"></span>
                  <span class="sub-card-name">{{ device.name }}</span>
                  <span class="type-tag sensor">센서</span>
                </div>
                <div v-if="device.sensorData && Object.keys(device.sensorData).length > 0" class="sub-card-sensor-grid">
                  <div v-for="(val, key) in getTopSensorData(device.sensorData)" :key="key" class="sensor-grid-item">
                    <span class="sensor-grid-value">{{ formatSensorVal(key as string, val as number) }}<span class="sensor-grid-unit">{{ getSensorUnit(key as string) }}</span></span>
                    <span class="sensor-grid-label">{{ SENSOR_LABELS[key as string] || key }}</span>
                  </div>
                </div>
                <div v-else class="sub-card-value muted">{{ device.online ? '로딩 중...' : '오프라인' }}</div>
              </div>
            </div>
          </template>

          <!-- 장비(액추에이터 + 개폐기 + 관수) 목록 -->
          <template v-if="getGroupActuators(group).length > 0 || getGroupOpenerGroups(group).length > 0 || getGroupIrrigationDevices(group).length > 0">
            <div class="section-label actuator">장비 ({{ getGroupActuators(group).length + getGroupOpenerGroups(group).length + getGroupIrrigationDevices(group).length }})</div>
            <div class="device-sub-grid">
              <!-- 개폐기 그룹 카드 -->
              <div v-for="og in getGroupOpenerGroups(group)" :key="og.groupName" class="sub-card actuator">
                <div class="sub-card-top">
                  <span :class="['status-dot', og.openDevice.online || og.closeDevice.online ? 'online' : 'offline']"></span>
                  <span class="sub-card-name">{{ og.groupName }}</span>
                  <span class="type-tag actuator">개폐기</span>
                </div>
                <div class="sub-card-control" :class="{ disabled: !og.openDevice.online }">
                  <span class="control-label">열림</span>
                  <label class="toggle-switch" @click.prevent="og.openDevice.online && handleControl(og.openDevice.id, !og.openDevice.switchState)">
                    <input type="checkbox" :checked="og.openDevice.switchState === true" :disabled="!og.openDevice.online || controllingId === og.openDevice.id" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="sub-card-control" :class="{ disabled: !og.closeDevice.online }">
                  <span class="control-label">닫힘</span>
                  <label class="toggle-switch" @click.prevent="og.closeDevice.online && handleControl(og.closeDevice.id, !og.closeDevice.switchState)">
                    <input type="checkbox" :checked="og.closeDevice.switchState === true" :disabled="!og.closeDevice.online || controllingId === og.closeDevice.id" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
              <!-- 관수 장비 카드 -->
              <div v-for="device in getGroupIrrigationDevices(group)" :key="device.id" class="sub-card actuator">
                <div class="sub-card-top">
                  <span :class="['status-dot', device.online ? 'online' : 'offline']"></span>
                  <span class="sub-card-name">{{ device.name }}</span>
                  <button class="btn-status-sm" @click="openIrrigationStatusModal(device)">상태</button>
                  <span class="type-tag actuator">관수</span>
                </div>
                <div class="sub-card-control" :class="{ disabled: !device.online }">
                  <span class="control-label">타이머 전원/B접점</span>
                  <label class="toggle-switch" @click.prevent="device.online && handleIrrigationControl(device, 'switch_1')">
                    <input type="checkbox" :checked="device.switchStates?.switch_1 === true" :disabled="!device.online || irrigationControlling === device.id" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="sub-card-control" :class="{ disabled: !device.online }">
                  <span class="control-label">교반기/B접점</span>
                  <label class="toggle-switch" @click.prevent="device.online && handleIrrigationControl(device, 'switch_usb1')">
                    <input type="checkbox" :checked="device.switchStates?.switch_usb1 === true" :disabled="!device.online || irrigationControlling === device.id" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
              <!-- 일반 장비 카드 -->
              <div v-for="device in getGroupActuators(group)" :key="device.id" class="sub-card actuator">
                <div class="sub-card-top">
                  <span :class="['status-dot', device.online ? 'online' : 'offline']"></span>
                  <span class="sub-card-name">{{ device.name }}</span>
                  <span class="type-tag actuator">장비</span>
                </div>
                <div class="sub-card-control" :class="{ disabled: !device.online }">
                  <span class="control-label">{{ device.switchState === true ? '가동중' : '정지' }}</span>
                  <label class="toggle-switch" @click.prevent="device.online && handleControl(device.id, !device.switchState)">
                    <input type="checkbox" :checked="device.switchState === true" :disabled="!device.online || controllingId === device.id" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </template>

          <!-- 자동화 룰 -->
          <template v-if="getGroupRules(group.id).length > 0">
            <div class="section-label automation">자동화 ({{ getGroupRules(group.id).length }})</div>
            <div class="rules-list">
              <div v-for="rule in getGroupRules(group.id)" :key="rule.id" class="rule-row clickable" @click="openEditRule(rule)">
                <span class="rule-name">{{ rule.name }}</span>
                <span class="rule-summary">{{ getRuleSummary(rule) }}</span>
                <label class="toggle-switch" @click.stop>
                  <input type="checkbox" :checked="rule.enabled" @change="toggleRule(rule.id)" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <GroupCreation
      :show="showGroupCreationModal"
      @close="showGroupCreationModal = false"
      @created="handleGroupCreated"
    />

    <!-- 장비 추가 모달 -->
    <div v-if="showAddDeviceModal" class="modal-overlay" @click.self="showAddDeviceModal = false">
      <div class="add-device-modal">
        <div class="add-modal-header">
          <h3>{{ addDeviceTargetGroup?.name }}에 장비 추가</h3>
          <button class="close-btn" @click="showAddDeviceModal = false">✕</button>
        </div>
        <div class="add-modal-body">
          <div v-if="unassignedDevices.length === 0" class="empty-state-sm">
            <p>추가할 수 있는 장비가 없습니다.</p>
          </div>
          <template v-else>
            <div
              v-for="device in unassignedDevices"
              :key="device.id"
              class="device-row clickable"
              :class="{ selected: addDeviceSelected.includes(device.id) }"
              @click="toggleAddDevice(device.id)"
            >
              <input type="checkbox" :checked="addDeviceSelected.includes(device.id)" @click.stop />
              <span class="device-row-icon">{{ getCategoryIcon(device.category) }}</span>
              <span :class="['type-tag', device.deviceType === 'sensor' ? 'sensor' : 'actuator']">
                {{ device.deviceType === 'sensor' ? '센서' : '장비' }}
              </span>
              <span class="device-row-name">{{ device.name }}</span>
              <span :class="['status-indicator', device.online ? 'online' : 'offline']">
                {{ device.online ? '온라인' : '오프라인' }}
              </span>
            </div>
          </template>
        </div>
        <div class="add-modal-footer">
          <button class="btn-secondary" @click="showAddDeviceModal = false">취소</button>
          <button
            class="btn-primary"
            :disabled="addDeviceSelected.length === 0 || addingDevices"
            @click="confirmAddDevices"
          >
            <span v-if="addingDevices">추가 중...</span>
            <span v-else>{{ addDeviceSelected.length }}개 추가</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 관수 상태 모달 -->
    <div v-if="showIrrigationStatusModal && irrigationStatusDevice" class="modal-overlay" @click.self="showIrrigationStatusModal = false">
      <div class="status-modal">
        <div class="status-modal-header">
          <h3>{{ irrigationStatusDevice.name }} - 스위치 상태</h3>
          <button class="close-btn" @click="showIrrigationStatusModal = false">✕</button>
        </div>
        <div class="status-modal-body">
          <div
            v-for="(label, code) in IRRIGATION_SWITCH_LABELS"
            :key="code"
            class="status-row"
          >
            <span class="status-row-label">{{ label }}</span>
            <span
              class="status-row-value"
              :class="irrigationStatusDevice.switchStates?.[code] ? 'on' : 'off'"
            >
              {{ irrigationStatusDevice.switchStates?.[code] ? 'ON' : 'OFF' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 자동화 편집 모달 -->
    <AutomationEditModal
      :visible="showEditRuleModal"
      :rule="editingRule"
      @close="showEditRuleModal = false"
      @saved="onRuleEdited"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGroupStore } from '../stores/group.store'
import { useDeviceStore } from '../stores/device.store'
import { useAutomationStore } from '../stores/automation.store'
import GroupCreation from '@/components/groups/GroupCreation.vue'
import AutomationEditModal from '@/components/automation/AutomationEditModal.vue'
import { useConfirm } from '../composables/useConfirm'
import type { HouseGroup } from '../types/group.types'
import type { Device } from '../types/device.types'
import type { AutomationRule } from '../types/automation.types'
import { formatConditionGroup } from '../utils/automation-helpers'

const groupStore = useGroupStore()
const deviceStore = useDeviceStore()
const automationStore = useAutomationStore()
const { confirm } = useConfirm()
const showGroupCreationModal = ref(false)
const syncing = ref(false)
const groups = computed(() => groupStore.groups)
const loading = computed(() => groupStore.loading)

const collapsedGroups = ref(new Set<string>())

// 장비 추가 모달
const showAddDeviceModal = ref(false)
const addDeviceTargetGroup = ref<HouseGroup | null>(null)
const addDeviceSelected = ref<string[]>([])
const addingDevices = ref(false)

onMounted(async () => {
  await Promise.all([
    groupStore.fetchGroups(),
    deviceStore.fetchDevices(),
    automationStore.fetchRules(),
  ])
  await Promise.all([
    deviceStore.fetchAllSensorStatuses(),
    deviceStore.fetchAllActuatorStatuses(),
  ])
})

const toggleCollapse = (groupId: string) => {
  if (collapsedGroups.value.has(groupId)) {
    collapsedGroups.value.delete(groupId)
  } else {
    collapsedGroups.value.add(groupId)
  }
}

const getCategoryIcon = (category: string) => {
  const icons: Record<string, string> = {
    'wk': '💨', 'fs': '💨', 'cl': '🚪', 'mc': '🚪',
    'dj': '💡', 'dd': '💡', 'bh': '💦', 'sfkzq': '💦',
    'wsdcg': '🌡️', 'co2bj': '🌫️', 'ldcg': '🌱',
  }
  return icons[category] || '📦'
}

const getGroupSensors = (group: HouseGroup): Device[] =>
  (group.devices || []).filter(d => d.deviceType === 'sensor').map(d => {
    const storeDevice = deviceStore.devices.find(sd => sd.id === d.id)
    return storeDevice ? { ...d, sensorData: storeDevice.sensorData, online: storeDevice.online } : d
  })

// 개폐기 쌍 ID (개별 표시 제외용)
const getOpenerPairIds = (group: HouseGroup): Set<string> => {
  const devices = group.devices || []
  const ids = new Set<string>()
  for (const d of devices) {
    if ((d.equipmentType === 'opener_open' || d.equipmentType === 'opener_close') && d.pairedDeviceId) {
      ids.add(d.id)
    }
  }
  return ids
}

// 개폐기 그룹 대표 목록
interface OpenerGroupInfo {
  groupName: string
  openDevice: Device
  closeDevice: Device
}
const getGroupOpenerGroups = (group: HouseGroup): OpenerGroupInfo[] => {
  const devices = group.devices || []
  const opens = devices.filter(d => d.equipmentType === 'opener_open' && d.pairedDeviceId)
  return opens.map(od => {
    const cd = devices.find(d => d.id === od.pairedDeviceId)
    if (!cd) return null
    const storeOpen = deviceStore.devices.find(sd => sd.id === od.id)
    const storeClose = deviceStore.devices.find(sd => sd.id === cd.id)
    return {
      groupName: od.openerGroupName || od.name,
      openDevice: storeOpen ? { ...od, switchState: storeOpen.switchState, online: storeOpen.online } : od,
      closeDevice: storeClose ? { ...cd, switchState: storeClose.switchState, online: storeClose.online } : cd,
    }
  }).filter(Boolean) as OpenerGroupInfo[]
}

const getGroupActuators = (group: HouseGroup): Device[] => {
  const openerIds = getOpenerPairIds(group)
  return (group.devices || [])
    .filter(d => d.deviceType === 'actuator' && !openerIds.has(d.id) && d.equipmentType !== 'irrigation')
    .map(d => {
      const storeDevice = deviceStore.devices.find(sd => sd.id === d.id)
      return storeDevice ? { ...d, switchState: storeDevice.switchState, online: storeDevice.online } : d
    })
}

// 관수 장비
const getGroupIrrigationDevices = (group: HouseGroup): Device[] => {
  return (group.devices || [])
    .filter(d => d.equipmentType === 'irrigation')
    .map(d => {
      const storeDevice = deviceStore.devices.find(sd => sd.id === d.id)
      return storeDevice ? { ...d, switchStates: storeDevice.switchStates, online: storeDevice.online } : d
    })
}

const irrigationControlling = ref<string | null>(null)

// 관수 상태 모달
const showIrrigationStatusModal = ref(false)
const irrigationStatusDevice = ref<Device | null>(null)

const IRRIGATION_SWITCH_LABELS: Record<string, string> = {
  switch_1: '타이머 전원/B접점',
  switch_2: '1구역 관수',
  switch_3: '2구역 관수',
  switch_4: '3구역 관수',
  switch_5: '4구역 관수',
  switch_6: '5구역 관수',
  switch_usb1: '교반기 모터/B접점',
  switch_usb2: '액비모터',
}

const openIrrigationStatusModal = (device: Device) => {
  irrigationStatusDevice.value = device
  showIrrigationStatusModal.value = true
}

const handleIrrigationControl = async (device: Device, switchCode: string) => {
  irrigationControlling.value = device.id
  try {
    const currentVal = device.switchStates?.[switchCode] ?? false
    await deviceStore.controlDevice(device.id, [{ code: switchCode, value: !currentVal }])
    const storeDevice = deviceStore.devices.find(d => d.id === device.id)
    if (storeDevice) {
      if (!storeDevice.switchStates) storeDevice.switchStates = {}
      storeDevice.switchStates[switchCode] = !currentVal
    }
  } catch (err: any) {
    console.error('관수 장비 제어 실패:', err)
    alert('장비 제어에 실패했습니다.')
  } finally {
    irrigationControlling.value = null
  }
}

const SENSOR_LABELS: Record<string, string> = {
  temperature: '온도', humidity: '습도', co2: 'CO2',
  rainfall: '강우량', uv: 'UV', dew_point: '이슬점',
}

const ALLOWED_SENSOR_FIELDS = new Set(['temperature', 'humidity', 'co2', 'rainfall', 'uv', 'dew_point'])

function getTopSensorData(sensorData: Record<string, number | null | undefined>): Record<string, number> {
  const entries = Object.entries(sensorData).filter(([k, v]) => v != null && ALLOWED_SENSOR_FIELDS.has(k)) as [string, number][]
  return Object.fromEntries(entries)
}

const formatSensorVal = (field: string, value: number): string => {
  if (value == null) return '-'
  if (['temperature', 'dew_point', 'ph', 'ec', 'rainfall'].includes(field)) return value.toFixed(1)
  if (['co2', 'light'].includes(field)) return Math.round(value).toLocaleString()
  return Math.round(value).toString()
}

const getSensorUnit = (field: string): string => {
  const units: Record<string, string> = {
    temperature: '°C', humidity: '%', co2: 'ppm', rainfall: 'mm',
    uv: '', dew_point: '°C', light: 'lux',
    soil_moisture: '%', ph: '', ec: 'mS/cm',
  }
  return units[field] || ''
}

// 장비 제어
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

// 자동화 룰
const getGroupRules = (groupId: string): AutomationRule[] =>
  automationStore.rules.filter(r => r.groupId === groupId)

const getRuleSummary = (rule: AutomationRule): string => {
  const condText = formatConditionGroup(rule.conditions)
  const actions = rule.actions as any
  const cmd = actions?.command === 'on' ? 'ON' : actions?.command === 'off' ? 'OFF' : ''
  const count = actions?.targetDeviceIds?.length || 0
  if (count > 0 && cmd) return `${condText} → ${count}개 장비 ${cmd}`
  return condText
}

const toggleRule = async (ruleId: string) => {
  try {
    await automationStore.toggleRule(ruleId)
  } catch (err) {
    console.error('룰 토글 실패:', err)
  }
}

// 자동화 편집 모달
const showEditRuleModal = ref(false)
const editingRule = ref<AutomationRule | null>(null)

const openEditRule = (rule: AutomationRule) => {
  editingRule.value = rule
  showEditRuleModal.value = true
}

const onRuleEdited = () => {
  automationStore.fetchRules()
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

const unassignedDevices = computed(() => {
  const assignedIds = new Set(
    groups.value.flatMap(g => (g.devices || []).map(d => d.id))
  )
  // 개폐기는 opener_open만 대표로 보여주고 opener_close는 숨김
  // (그룹에 추가할 때 opener_open 선택 시 쌍인 opener_close도 함께 추가됨)
  return deviceStore.devices.filter(d => {
    if (assignedIds.has(d.id)) return false
    if (d.equipmentType === 'opener_close' && d.pairedDeviceId) return false
    return true
  })
})

const handleGroupCreated = () => {
  showGroupCreationModal.value = false
}

const deleteGroup = async (group: HouseGroup) => {
  const ok = await confirm({
    title: '그룹 삭제',
    message: `"${group.name}" 그룹을 삭제하시겠습니까?`,
    confirmText: '삭제',
    variant: 'danger',
  })
  if (!ok) return
  try {
    await groupStore.removeGroup(group.id)
  } catch (err) {
    console.error('그룹 삭제 실패:', err)
    alert('그룹 삭제에 실패했습니다.')
  }
}

const openAddDeviceModal = (group: HouseGroup) => {
  addDeviceTargetGroup.value = group
  addDeviceSelected.value = []
  showAddDeviceModal.value = true
}

const toggleAddDevice = (deviceId: string) => {
  const idx = addDeviceSelected.value.indexOf(deviceId)
  if (idx === -1) addDeviceSelected.value.push(deviceId)
  else addDeviceSelected.value.splice(idx, 1)
}

const confirmAddDevices = async () => {
  if (!addDeviceTargetGroup.value) return
  addingDevices.value = true
  try {
    // 개폐기 대표(opener_open) 선택 시 쌍(opener_close)도 자동 추가
    const idsToAdd = [...addDeviceSelected.value]
    for (const id of addDeviceSelected.value) {
      const dev = deviceStore.devices.find(d => d.id === id)
      if (dev?.equipmentType === 'opener_open' && dev.pairedDeviceId && !idsToAdd.includes(dev.pairedDeviceId)) {
        idsToAdd.push(dev.pairedDeviceId)
      }
    }
    await groupStore.assignDevices(addDeviceTargetGroup.value.id, idsToAdd)
    showAddDeviceModal.value = false
  } catch (err) {
    console.error('장비 추가 실패:', err)
    alert('장비 추가에 실패했습니다.')
  } finally {
    addingDevices.value = false
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
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-header h2 { font-size: calc(28px * var(--content-scale, 1)); font-weight: 700; color: var(--text-primary); }
.page-description { color: var(--text-secondary); font-size: calc(14px * var(--content-scale, 1)); margin-top: 4px; }

.header-actions {
  display: flex;
  gap: 10px;
}

.btn-primary {
  padding: 14px 28px; background: var(--accent); color: white; border: none;
  border-radius: 8px; font-weight: 600; font-size: calc(16px * var(--content-scale, 1)); cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-outline {
  padding: 12px 24px; background: var(--bg-secondary); color: var(--text-primary);
  border: 1px solid var(--border-color); border-radius: 8px; font-weight: 500;
  font-size: calc(15px * var(--content-scale, 1)); cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.btn-outline:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-bg); }
.btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }

.loading-state, .empty-state {
  text-align: center; padding: 60px 20px; color: var(--text-secondary); font-size: calc(16px * var(--content-scale, 1));
}
.empty-state .btn-primary { margin-top: 16px; }

/* 그룹 리스트 */
.groups-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 14px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  gap: 12px;
}

.group-title {
  flex: 1;
  min-width: 0;
}

.group-title h3 {
  font-size: calc(18px * var(--content-scale, 1));
  font-weight: 600;
  color: var(--text-primary);
}

.group-desc {
  font-size: calc(13px * var(--content-scale, 1));
  color: var(--text-muted);
  margin-top: 4px;
}

.group-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.device-count-badge {
  padding: 4px 12px;
  background: var(--bg-badge);
  border-radius: 20px;
  font-size: calc(13px * var(--content-scale, 1));
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.btn-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: calc(14px * var(--content-scale, 1));
  color: var(--text-link);
  transition: background 0.2s;
}
.btn-icon:hover { background: var(--border-light); }
.btn-icon.danger:hover { background: var(--danger-bg); color: var(--danger); }

/* 그룹 본문 */
.group-body {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: calc(13px * var(--content-scale, 1));
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  display: inline-block;
}
.section-label.sensor { background: var(--sensor-bg); color: var(--sensor-accent); }
.section-label.actuator { background: var(--accent-bg); color: var(--accent); }
.section-label.automation { background: var(--automation-bg); color: var(--automation-text); }

.device-sub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.sub-card {
  background: var(--bg-hover);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-light);
}

.sub-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.online { background: var(--toggle-on); }
.status-dot.offline { background: var(--border-color); }

.sub-card-name {
  flex: 1;
  font-size: calc(14px * var(--content-scale, 1));
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-tag {
  font-size: calc(13px * var(--content-scale, 1));
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}
.type-tag.sensor { background: var(--sensor-bg); color: var(--sensor-accent); }
.type-tag.actuator { background: var(--accent-bg); color: var(--accent); }

.sub-card-sensor-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 2px 0;
}

.sensor-grid-item {
  text-align: center;
  padding: 4px 4px;
  min-width: 50px;
}

.sensor-grid-value {
  display: block;
  font-size: calc(18px * var(--content-scale, 1));
  font-weight: 700;
  color: var(--sensor-accent);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.sensor-grid-unit {
  font-size: calc(11px * var(--content-scale, 1));
  font-weight: 500;
  color: var(--text-muted);
  margin-left: 1px;
}

.sensor-grid-label {
  display: block;
  font-size: calc(11px * var(--content-scale, 1));
  color: var(--text-muted);
  margin-top: 2px;
}

.sub-card-value.muted {
  font-size: calc(13px * var(--content-scale, 1));
  font-weight: 400;
  color: var(--text-muted);
}

.sub-card-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.sub-card-control + .sub-card-control {
  border-top: 1px solid var(--border-light);
}

.sub-card-control.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.control-label {
  font-size: calc(14px * var(--content-scale, 1));
  font-weight: 600;
  color: var(--accent);
}

/* 토글 스위치 */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  cursor: pointer;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--toggle-off); border-radius: 26px;
  transition: background 0.3s;
}
.toggle-slider:before {
  content: ''; position: absolute;
  height: 20px; width: 20px;
  left: 3px; bottom: 3px;
  background: white; border-radius: 50%;
  transition: transform 0.3s;
}
input:checked + .toggle-slider { background: var(--toggle-on); }
input:checked + .toggle-slider:before { transform: translateX(22px); }

/* 작은 토글 */
.toggle-switch-sm {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}
.toggle-switch-sm input { opacity: 0; width: 0; height: 0; }
.toggle-slider-sm {
  position: absolute; cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--toggle-off); border-radius: 20px;
  transition: background 0.3s;
}
.toggle-slider-sm:before {
  content: ''; position: absolute;
  height: 14px; width: 14px;
  left: 3px; bottom: 3px;
  background: white; border-radius: 50%;
  transition: transform 0.3s;
}
input:checked + .toggle-slider-sm { background: var(--toggle-on); }
input:checked + .toggle-slider-sm:before { transform: translateX(16px); }

/* 자동화 룰 */
.rules-list {
  background: var(--bg-hover);
  border-radius: 10px;
  overflow: hidden;
}

.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: calc(13px * var(--content-scale, 1));
  border-bottom: 1px solid var(--border-light);
}
.rule-row:last-child { border-bottom: none; }
.rule-row.clickable { cursor: pointer; transition: background 0.15s; }
.rule-row.clickable:hover { background: var(--bg-secondary); }
.rule-name { font-weight: 600; color: var(--text-primary); white-space: nowrap; }
.rule-summary { flex: 1; color: var(--text-muted); font-size: calc(13px * var(--content-scale, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.no-devices {
  padding: 24px;
  text-align: center;
  background: var(--bg-hover);
  border-radius: 10px;
}
.no-devices p { color: var(--text-muted); font-size: calc(13px * var(--content-scale, 1)); margin: 0 0 8px; }

.btn-sm {
  padding: 8px 16px;
  background: var(--bg-badge);
  border: none;
  border-radius: 8px;
  font-size: calc(14px * var(--content-scale, 1));
  cursor: pointer;
  color: var(--text-secondary);
  transition: background 0.2s;
}
.btn-sm:hover { background: var(--border-color); }

/* 장비 추가 모달 */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--overlay);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 20px;
}
.add-device-modal {
  background: var(--bg-card); border-radius: 16px;
  width: 100%; max-width: 550px; max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-modal);
}
.add-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 24px; border-bottom: 1px solid var(--border-color);
}
.add-modal-header h3 { font-size: calc(18px * var(--content-scale, 1)); font-weight: 600; margin: 0; }
.add-modal-body {
  flex: 1; overflow-y: auto; padding: 16px 24px; max-height: 400px;
}
.add-modal-footer {
  display: flex; justify-content: flex-end; gap: 12px;
  padding: 16px 24px; border-top: 1px solid var(--border-color);
}
.close-btn {
  background: none; border: none; font-size: 20px; color: var(--text-muted);
  cursor: pointer; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
}
.btn-secondary {
  padding: 10px 20px; background: var(--bg-hover); color: var(--text-primary);
  border: none; border-radius: 8px; font-weight: 500; cursor: pointer;
}

.device-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; font-size: calc(14px * var(--content-scale, 1));
  border-bottom: 1px solid var(--border-light);
}
.device-row:last-child { border-bottom: none; }
.device-row.clickable { cursor: pointer; }
.device-row.clickable:hover { background: var(--bg-hover); }
.device-row.selected { background: var(--accent-bg); }
.device-row input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; flex-shrink: 0; }
.device-row-icon { font-size: calc(18px * var(--content-scale, 1)); flex-shrink: 0; }
.device-row-name { flex: 1; }

.status-indicator {
  font-size: calc(13px * var(--content-scale, 1)); font-weight: 500; flex-shrink: 0;
  padding: 2px 8px; border-radius: 8px;
}
.status-indicator.online { background: var(--accent-bg); color: var(--accent); }
.status-indicator.offline { background: var(--danger-bg); color: var(--danger); }

.empty-state-sm { padding: 32px; text-align: center; color: var(--text-muted); }

/* 관수 상태 버튼 (소형) */
.btn-status-sm {
  padding: 2px 8px;
  background: var(--bg-secondary);
  color: var(--text-link);
  border: 1px solid var(--border-input);
  border-radius: 4px;
  font-size: calc(12px * var(--content-scale, 1));
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.2s, background 0.2s;
}
.btn-status-sm:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
}

/* 관수 상태 모달 */
.status-modal {
  background: var(--bg-card);
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow-modal);
}

.status-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.status-modal-header h3 {
  font-size: calc(18px * var(--content-scale, 1));
  font-weight: 600;
  margin: 0;
}

.status-modal-body {
  padding: 16px 24px 24px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
}
.status-row:last-child {
  border-bottom: none;
}

.status-row-label {
  font-size: calc(15px * var(--content-scale, 1));
  font-weight: 500;
  color: var(--text-primary);
}

.status-row-value {
  font-size: calc(14px * var(--content-scale, 1));
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
}
.status-row-value.on {
  background: var(--accent-bg);
  color: var(--accent);
}
.status-row-value.off {
  background: var(--bg-badge);
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .page-container { padding: 16px; }
  .page-header h2 { font-size: calc(24px * var(--content-scale, 1)); }
  .device-sub-grid { grid-template-columns: 1fr; }
  .group-header { flex-direction: column; align-items: flex-start; }
  .group-header-actions { width: 100%; justify-content: flex-end; }

  .modal-overlay { padding: 0; }
  .add-device-modal {
    border-radius: 0;
    max-width: 100%;
    max-height: 100%;
    height: 100vh;
    height: 100dvh;
  }
}
</style>
