<template>
  <div class="step-actuator">
    <h3 class="step-title">장비 선택</h3>
    <p class="step-desc">조건 충족 시 제어할 장비를 선택하세요</p>

    <div v-if="actuators.length === 0" class="empty">
      선택한 그룹에 제어 가능한 장비가 없습니다.
    </div>
    <template v-else>
      <!-- 장비 목록 (라디오 단일 선택) -->
      <div class="device-list">
        <div
          v-for="device in actuators"
          :key="device.id"
          class="device-card"
          :class="{ selected: selectedId === device.id }"
          @click="selectDevice(device.id)"
        >
          <div class="device-icon">⚙️</div>
          <div class="device-info">
            <div class="device-name">{{ device.name }}</div>
            <div class="device-meta">
              <span class="category">{{ device.category }}</span>
              <span class="status" :class="{ online: device.online }">
                {{ device.online ? '온라인' : '오프라인' }}
              </span>
            </div>
          </div>
          <div class="radio-mark" :class="{ checked: selectedId === device.id }">
            <span v-if="selectedId === device.id">●</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGroupStore } from '../../stores/group.store'

const props = defineProps<{
  selectedId?: string
  groupId?: string
}>()
const emit = defineEmits<{
  'update:selectedId': [value: string]
}>()

const groupStore = useGroupStore()

const actuators = computed(() => {
  if (!props.groupId) return []
  const group = groupStore.groups.find(g => g.id === props.groupId)
  if (!group) return []
  // 개폐기(opener_open, opener_close) 제외
  return (group.devices || []).filter(d =>
    d.deviceType === 'actuator' &&
    d.equipmentType !== 'opener_open' &&
    d.equipmentType !== 'opener_close'
  )
})

function selectDevice(deviceId: string) {
  emit('update:selectedId', deviceId)
}
</script>

<style scoped>
.step-actuator { display: flex; flex-direction: column; gap: 16px; }
.step-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; }
.step-desc { font-size: 14px; color: var(--text-muted); margin: 0; }

.empty {
  text-align: center; padding: 32px; color: var(--text-muted); font-size: 14px;
}

.device-list { display: flex; flex-direction: column; gap: 8px; }

.device-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border: 2px solid var(--border-input); border-radius: 12px;
  cursor: pointer; transition: all 0.15s;
}
.device-card:hover { border-color: #ffe0b2; background: var(--bg-hover); }
.device-card.selected { border-color: #ff9800; background: rgba(255, 152, 0, 0.1); }

.device-icon { font-size: 24px; }
.device-info { flex: 1; }
.device-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.device-meta { display: flex; gap: 8px; align-items: center; margin-top: 2px; }
.category { font-size: 13px; color: var(--text-muted); }
.status { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: var(--bg-secondary); color: var(--text-muted); }
.status.online { background: #e8f5e9; color: #4caf50; }

.radio-mark {
  width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border-input);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: white; transition: all 0.15s;
}
.radio-mark.checked { background: #ff9800; border-color: #ff9800; }
</style>
