<template>
  <div class="channel-mapping-section">
    <button class="btn-mapping-toggle" @click="isOpen = !isOpen">
      채널 설정 {{ isOpen ? '▲' : '▼' }}
    </button>
    <div v-if="isOpen && editMapping" class="channel-mapping-panel">
      <p class="mapping-desc">각 기능에 연결될 릴레이 채널을 설정합니다.</p>
      <div v-for="fnKey in mappingKeys" :key="fnKey" class="mapping-row">
        <span class="mapping-label">{{ FUNCTION_LABELS[fnKey] || fnKey }}</span>
        <select v-model="editMapping[fnKey]" class="mapping-select" :class="{ 'duplicate-warning': isDuplicate(fnKey) }">
          <option v-for="sw in availableSwitchCodes" :key="sw" :value="sw">{{ sw }}</option>
        </select>
      </div>
      <p v-if="hasDuplicate" class="warning-text">같은 채널이 중복 배정되어 있습니다.</p>
      <div class="mapping-actions">
        <button class="btn-save" :disabled="hasDuplicate || saving" @click="save">
          {{ saving ? '저장 중...' : '저장' }}
        </button>
        <button class="btn-reset" @click="reset">기본값 복원</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ChannelMapping, Device } from '../../types/device.types'
import { FUNCTION_LABELS, FUNCTION_DISPLAY_ORDER, detectChannelCount, getDefaultMappingByCount, getAvailableSwitchCodesByCount } from '../../types/device.types'
import { useDeviceStore } from '../../stores/device.store'
import { useNotificationStore } from '../../stores/notification.store'

const props = defineProps<{ device: Device }>()
const deviceStore = useDeviceStore()
const notify = useNotificationStore()

const isOpen = ref(false)
const editMapping = ref<ChannelMapping | null>(null)
const saving = ref(false)

const channelCount = computed<8 | 12>(() =>
  props.device.switchStates ? detectChannelCount(Object.keys(props.device.switchStates)) : 8
)
const mappingKeys = computed(() => {
  const effective = deviceStore.getEffectiveMapping(props.device)
  return FUNCTION_DISPLAY_ORDER.filter(key => key in effective)
})
const availableSwitchCodes = computed(() => getAvailableSwitchCodesByCount(channelCount.value))

watch(isOpen, (open) => {
  if (open) editMapping.value = { ...deviceStore.getEffectiveMapping(props.device) }
})

function isDuplicate(targetKey: string): boolean {
  if (!editMapping.value) return false
  const val = editMapping.value[targetKey]
  return Object.keys(editMapping.value).some(k => k !== targetKey && editMapping.value![k] === val)
}

const hasDuplicate = computed(() =>
  editMapping.value ? Object.keys(editMapping.value).some(k => isDuplicate(k)) : false
)

async function save() {
  if (!editMapping.value) return
  saving.value = true
  try {
    await deviceStore.updateChannelMapping(props.device.id, editMapping.value)
    notify.success('저장 완료', '채널 매핑이 저장되었습니다')
    isOpen.value = false
  } catch {
    notify.error('저장 실패', '채널 매핑 저장에 실패했습니다')
  } finally {
    saving.value = false
  }
}

function reset() {
  editMapping.value = { ...getDefaultMappingByCount(channelCount.value) }
}
</script>

<style scoped>
.channel-mapping-section {
  margin-top: 8px;
  border-top: 1px solid var(--border-input);
  padding-top: 8px;
}
.btn-mapping-toggle {
  background: none;
  border: none;
  color: var(--text-link);
  font-size: var(--font-size-caption);
  cursor: pointer;
  padding: 2px 0;
}
.channel-mapping-panel { margin-top: 8px; }
.mapping-desc { font-size: var(--font-size-tiny); color: var(--text-secondary); margin-bottom: 8px; }
.mapping-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.mapping-label { font-size: var(--font-size-caption); color: var(--text-primary); flex: 1; }
.mapping-select {
  padding: 3px 6px; border: 1px solid var(--border-input); border-radius: 4px;
  font-size: var(--font-size-caption); background: var(--bg-secondary); color: var(--text-primary); min-width: 110px;
}
.mapping-select.duplicate-warning { border-color: #e67e22; }
.warning-text { font-size: var(--font-size-tiny); color: #e67e22; margin: 4px 0; }
.mapping-actions { display: flex; gap: 8px; margin-top: 8px; }
.mapping-actions .btn-save {
  padding: 5px 14px; background: var(--color-primary, #2ecc71); color: #fff;
  border: none; border-radius: 6px; font-size: var(--font-size-caption); cursor: pointer;
}
.mapping-actions .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.mapping-actions .btn-reset {
  padding: 5px 14px; background: var(--bg-secondary); color: var(--text-secondary);
  border: 1px solid var(--border-input); border-radius: 6px; font-size: var(--font-size-caption); cursor: pointer;
}
</style>
