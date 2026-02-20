<template>
  <div class="step-actuator">
    <h3 class="step-title">장비 선택</h3>
    <p class="step-desc">조건 충족 시 제어할 장비를 선택하고 동작을 설정하세요</p>

    <div v-if="actuators.length === 0" class="empty">
      선택한 그룹에 제어 가능한 장비가 없습니다.
    </div>
    <template v-else>
      <!-- 장비 목록 -->
      <div class="device-list">
        <div
          v-for="device in actuators"
          :key="device.id"
          class="device-card"
          :class="{ selected: deviceIds.includes(device.id) }"
          @click="toggleDevice(device.id)"
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
          <div class="check-box" :class="{ checked: deviceIds.includes(device.id) }">
            <span v-if="deviceIds.includes(device.id)">✓</span>
          </div>
        </div>
      </div>

      <!-- 동작 선택 -->
      <div v-if="deviceIds.length > 0" class="action-section">
        <h4 class="section-label">동작 설정</h4>
        <div class="command-toggle">
          <button
            class="cmd-btn on"
            :class="{ active: command === 'on' }"
            @click="$emit('update:command', 'on')"
          >ON</button>
          <button
            class="cmd-btn off"
            :class="{ active: command === 'off' }"
            @click="$emit('update:command', 'off')"
          >OFF</button>
        </div>
        <p class="action-desc">
          조건 충족 시 선택된 {{ deviceIds.length }}개 장비를
          <strong>{{ command === 'on' ? 'ON (켜기)' : 'OFF (끄기)' }}</strong>
          합니다.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGroupStore } from '../../stores/group.store'

const props = defineProps<{
  deviceIds: string[]
  command: 'on' | 'off'
  groupId?: string
}>()
const emit = defineEmits<{
  'update:deviceIds': [value: string[]]
  'update:command': [value: 'on' | 'off']
}>()

const groupStore = useGroupStore()

const actuators = computed(() => {
  if (!props.groupId) return []
  const group = groupStore.groups.find(g => g.id === props.groupId)
  if (!group) return []
  return (group.devices || []).filter(d => d.deviceType === 'actuator')
})

function toggleDevice(deviceId: string) {
  const current = [...props.deviceIds]
  const idx = current.indexOf(deviceId)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(deviceId)
  }
  emit('update:deviceIds', current)
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

.check-box {
  width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--border-input);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: white; transition: all 0.15s;
}
.check-box.checked { background: #ff9800; border-color: #ff9800; }

.action-section {
  margin-top: 8px; padding: 16px; background: var(--bg-secondary);
  border-radius: 12px; border: 1px solid var(--border-light);
}
.section-label { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0 0 12px; }

.command-toggle { display: flex; gap: 8px; }
.cmd-btn {
  flex: 1; padding: 12px; border: 2px solid var(--border-input); border-radius: 10px;
  font-size: 16px; font-weight: 700; cursor: pointer;
  background: var(--bg-card); color: var(--text-primary); transition: all 0.15s;
}
.cmd-btn.on:hover, .cmd-btn.on.active { border-color: #4caf50; background: rgba(76, 175, 80, 0.1); color: #4caf50; }
.cmd-btn.off:hover, .cmd-btn.off.active { border-color: #f44336; background: rgba(244, 67, 54, 0.1); color: #f44336; }

.action-desc { font-size: 13px; color: var(--text-secondary); margin: 12px 0 0; }
</style>
