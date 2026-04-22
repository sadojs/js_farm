<template>
  <div class="channel-mapping-section">
    <button class="btn-mapping-toggle" @click="isOpen = !isOpen">
      구역 설정 {{ isOpen ? '▲' : '▼' }}
    </button>
    <div v-if="isOpen && editMapping" class="channel-mapping-panel">
      <p class="mapping-desc">각 기능에 연결될 릴레이 구역을 설정합니다.</p>
      <div v-for="fnKey in mappingKeys" :key="fnKey" class="mapping-row">
        <span class="mapping-label">{{ FUNCTION_LABELS[fnKey] || fnKey }}</span>
        <select v-model="editMapping[fnKey]" class="mapping-select" :class="{ 'duplicate-warning': isDuplicate(fnKey) }">
          <option v-for="sw in availableSwitchCodes" :key="sw" :value="sw">{{ sw }}</option>
        </select>
      </div>
      <p v-if="hasDuplicate" class="warning-text">같은 구역이 중복 배정되어 있습니다.</p>
      <div class="mapping-actions">
        <button class="btn-save" :disabled="hasDuplicate || saving" @click="confirmSave">
          {{ saving ? '저장 중...' : '저장' }}
        </button>
        <button class="btn-reset" @click="reset">기본값 복원</button>
      </div>
    </div>

    <!-- 저장 전 경고 확인 모달 -->
    <div v-if="showConfirm" class="mapping-confirm-overlay" @click.self="showConfirm = false">
      <div class="mapping-confirm-modal">
        <div class="confirm-icon">⚠️</div>
        <h4 class="confirm-title">구역 설정 변경 확인</h4>
        <div class="confirm-body">
          <p class="confirm-warning">
            <strong>주의:</strong> 컨트롤 박스의 각 스위치(포트)는 설치 시 특정 기능에 배선된 상태입니다.
          </p>
          <p class="confirm-warning">
            구역 설정을 변경하면 <strong>실제 배선과 불일치</strong>가 발생하여 <strong>오동작, 장치 손상 또는 안전 사고</strong>로 이어질 수 있습니다.
          </p>
          <p class="confirm-note">
            변경이 필요한 경우, 반드시 컨트롤 박스 배선 도면과 일치하는지 확인한 후 저장하세요.
          </p>
        </div>
        <div class="confirm-actions">
          <button class="btn-confirm-cancel" @click="showConfirm = false">취소</button>
          <button class="btn-confirm-ok" @click="save">배선 확인 완료 — 저장</button>
        </div>
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
const showConfirm = ref(false)

function confirmSave() {
  if (!editMapping.value) return
  showConfirm.value = true
}

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
  showConfirm.value = false
  saving.value = true
  try {
    await deviceStore.updateChannelMapping(props.device.id, editMapping.value)
    notify.success('저장 완료', '구역 매핑이 저장되었습니다')
    isOpen.value = false
  } catch {
    notify.error('저장 실패', '구역 매핑 저장에 실패했습니다')
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

.mapping-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
}
.mapping-confirm-modal {
  background: var(--bg-card, #fff);
  border-radius: 16px;
  padding: 24px 20px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
.confirm-icon { font-size: 36px; text-align: center; margin-bottom: 8px; }
.confirm-title { font-size: 16px; font-weight: 700; color: #d32f2f; text-align: center; margin: 0 0 16px; }
.confirm-body { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.confirm-warning {
  font-size: 13px; line-height: 1.6; color: var(--text-primary, #333);
  background: #fff3e0; border-left: 3px solid #e65100;
  padding: 8px 12px; border-radius: 4px; margin: 0;
}
.confirm-note { font-size: 12px; color: var(--text-secondary, #666); margin: 0; line-height: 1.5; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn-confirm-cancel {
  padding: 8px 18px; border: 1px solid var(--border-color, #ddd);
  background: none; border-radius: 8px; font-size: 13px; cursor: pointer; color: var(--text-secondary, #666);
}
.btn-confirm-cancel:hover { background: var(--bg-secondary); }
.btn-confirm-ok {
  padding: 8px 18px; background: #d32f2f; color: #fff;
  border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-confirm-ok:hover { background: #b71c1c; }
#app.theme-dark .mapping-confirm-modal { background: var(--bg-card); }
#app.theme-dark .confirm-warning { background: #3e2723; }
</style>
