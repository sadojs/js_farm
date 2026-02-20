<template>
  <div class="step-condition">
    <h3 class="step-title">조건 설정</h3>
    <p class="step-desc">{{ timeOnly ? '시간 기반 조건을 설정하세요.' : '센서 데이터 조건을 설정하세요.' }} 조건 충족 시 장비가 동작합니다.</p>

    <div class="condition-groups">
      <div
        v-for="(group, gi) in modelValue.groups"
        :key="gi"
        class="condition-group"
      >
        <!-- 그룹 헤더 -->
        <div v-if="gi > 0" class="group-logic">
          <select
            :value="modelValue.logic"
            @change="updateGroupLogic(($event.target as HTMLSelectElement).value as 'AND' | 'OR')"
            class="logic-select"
          >
            <option value="AND">AND (모두 만족)</option>
            <option value="OR">OR (하나 이상 만족)</option>
          </select>
        </div>

        <div class="group-box">
          <div
            v-for="(cond, ci) in group.conditions"
            :key="ci"
            class="condition-row"
          >
            <!-- 조건 간 로직 -->
            <div v-if="ci > 0" class="row-logic">
              <select
                :value="group.logic"
                @change="updateSetLogic(gi, ($event.target as HTMLSelectElement).value as 'AND' | 'OR')"
                class="logic-select small"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            </div>

            <div class="row-fields">
              <!-- 필드 선택 -->
              <select
                :value="cond.field"
                @change="changeField(gi, ci, ($event.target as HTMLSelectElement).value)"
                class="field-select"
              >
                <option v-for="f in availableFields" :key="f.value" :value="f.value">
                  {{ f.label }}
                </option>
              </select>

              <!-- 연산자 선택 -->
              <select
                :value="cond.operator"
                @change="changeOperator(gi, ci, ($event.target as HTMLSelectElement).value)"
                class="op-select"
              >
                <option v-for="op in getOperators(cond.field)" :key="op" :value="op">
                  {{ OPERATOR_LABELS_KR[op] || op }}
                </option>
              </select>

              <!-- 값 입력 -->
              <template v-if="cond.field === 'rain'">
                <select
                  :value="cond.value ? 'true' : 'false'"
                  @change="changeValue(gi, ci, ($event.target as HTMLSelectElement).value === 'true')"
                  class="value-input"
                >
                  <option value="true">예 (비 감지)</option>
                  <option value="false">아니오</option>
                </select>
              </template>
              <template v-else-if="cond.field === 'hour' && cond.operator === 'between'">
                <input
                  type="number" min="0" max="23"
                  :value="Array.isArray(cond.value) ? cond.value[0] : 0"
                  @input="changeTimeRange(gi, ci, 0, Number(($event.target as HTMLInputElement).value))"
                  class="value-input small"
                />
                <span class="range-sep">~</span>
                <input
                  type="number" min="0" max="23"
                  :value="Array.isArray(cond.value) ? cond.value[1] : 23"
                  @input="changeTimeRange(gi, ci, 1, Number(($event.target as HTMLInputElement).value))"
                  class="value-input small"
                />
                <span class="unit">시</span>
              </template>
              <template v-else-if="cond.field === 'hour'">
                <input
                  type="number" min="0" max="23"
                  :value="cond.value"
                  @input="changeValue(gi, ci, Number(($event.target as HTMLInputElement).value))"
                  class="value-input small"
                />
                <span class="unit">시</span>
              </template>
              <template v-else>
                <input
                  type="number"
                  :value="cond.value"
                  @input="changeValue(gi, ci, Number(($event.target as HTMLInputElement).value))"
                  class="value-input"
                />
                <span v-if="getUnit(cond.field)" class="unit">{{ getUnit(cond.field) }}</span>
              </template>

              <!-- 삭제 -->
              <button
                v-if="group.conditions.length > 1"
                class="btn-remove"
                @click="removeCondition(gi, ci)"
              >✕</button>
            </div>
          </div>

          <!-- 조건 추가 -->
          <button class="btn-add-condition" @click="addCondition(gi)">+ 조건 추가</button>
        </div>
      </div>
    </div>

    <!-- 그룹 추가 -->
    <button class="btn-add-group" @click="addGroup">+ 조건 그룹 추가</button>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import type { ConditionGroup, Condition } from '../../types/automation.types'
import {
  SENSOR_CONDITION_FIELDS,
  OPERATOR_LABELS_KR,
  FIELD_UNITS,
  createEmptyCondition,
  createEmptyConditionSet,
} from '../../utils/automation-helpers'

const props = defineProps<{
  modelValue: ConditionGroup
  timeOnly?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: ConditionGroup] }>()

const TIME_ONLY_FIELDS = SENSOR_CONDITION_FIELDS.filter(f => f.type === 'time')

const availableFields = computed(() => {
  return props.timeOnly ? TIME_ONLY_FIELDS : SENSOR_CONDITION_FIELDS
})

// timeOnly 모드로 전환 시, 기존 센서 조건을 시간 조건으로 변경
watch(() => props.timeOnly, (isTimeOnly) => {
  if (!isTimeOnly) return
  const next = clone()
  let changed = false
  for (const group of next.groups) {
    for (let i = 0; i < group.conditions.length; i++) {
      if (group.conditions[i].type !== 'time') {
        group.conditions[i] = { type: 'time', field: 'hour', operator: 'eq', value: 9, unit: '' }
        changed = true
      }
    }
  }
  if (changed) emit('update:modelValue', next)
})

function clone(): ConditionGroup {
  return JSON.parse(JSON.stringify(props.modelValue))
}

function getOperators(field: string): string[] {
  const def = SENSOR_CONDITION_FIELDS.find(f => f.value === field)
  return def?.operators || ['eq']
}

function getUnit(field: string): string {
  return FIELD_UNITS[field] || ''
}

function updateGroupLogic(logic: 'AND' | 'OR') {
  const next = clone()
  next.logic = logic
  emit('update:modelValue', next)
}

function updateSetLogic(gi: number, logic: 'AND' | 'OR') {
  const next = clone()
  next.groups[gi].logic = logic
  emit('update:modelValue', next)
}

function changeField(gi: number, ci: number, field: string) {
  const next = clone()
  const def = SENSOR_CONDITION_FIELDS.find(f => f.value === field)
  next.groups[gi].conditions[ci] = {
    type: def?.type || 'sensor',
    field,
    operator: (def?.operators[0] as Condition['operator']) || 'gte',
    value: def?.defaultValue ?? 0,
    unit: def?.unit || '',
  }
  emit('update:modelValue', next)
}

function changeOperator(gi: number, ci: number, operator: string) {
  const next = clone()
  const cond = next.groups[gi].conditions[ci]
  cond.operator = operator as Condition['operator']
  if (operator === 'between' && !Array.isArray(cond.value)) {
    cond.value = [Number(cond.value) || 0, (Number(cond.value) || 0) + 10]
  } else if (operator !== 'between' && Array.isArray(cond.value)) {
    cond.value = cond.value[0]
  }
  emit('update:modelValue', next)
}

function changeValue(gi: number, ci: number, value: any) {
  const next = clone()
  next.groups[gi].conditions[ci].value = value
  emit('update:modelValue', next)
}

function changeTimeRange(gi: number, ci: number, idx: number, value: number) {
  const next = clone()
  const cond = next.groups[gi].conditions[ci]
  if (!Array.isArray(cond.value)) cond.value = [0, 23]
  ;(cond.value as [number, number])[idx] = value
  emit('update:modelValue', next)
}

function addCondition(gi: number) {
  const next = clone()
  if (props.timeOnly) {
    next.groups[gi].conditions.push({ type: 'time', field: 'hour', operator: 'eq', value: 9, unit: '' })
  } else {
    next.groups[gi].conditions.push(createEmptyCondition())
  }
  emit('update:modelValue', next)
}

function removeCondition(gi: number, ci: number) {
  const next = clone()
  next.groups[gi].conditions.splice(ci, 1)
  if (next.groups[gi].conditions.length === 0) {
    next.groups.splice(gi, 1)
  }
  if (next.groups.length === 0) {
    next.groups.push(createEmptyConditionSet())
  }
  emit('update:modelValue', next)
}

function addGroup() {
  const next = clone()
  next.groups.push(createEmptyConditionSet())
  emit('update:modelValue', next)
}
</script>

<style scoped>
.step-condition { display: flex; flex-direction: column; gap: 16px; }
.step-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; }
.step-desc { font-size: 14px; color: var(--text-muted); margin: 0; }

.condition-groups { display: flex; flex-direction: column; gap: 12px; }

.group-logic {
  display: flex; justify-content: center; padding: 4px 0;
}

.logic-select {
  padding: 6px 12px; border: 1px solid var(--border-input); border-radius: 8px;
  font-size: 13px; color: var(--text-secondary); background: var(--bg-input); cursor: pointer;
}
.logic-select.small { padding: 4px 8px; font-size: 12px; }

.group-box {
  border: 1px solid var(--border-input); border-radius: 12px; padding: 16px;
  background: var(--bg-secondary); display: flex; flex-direction: column; gap: 10px;
}

.condition-row { display: flex; flex-direction: column; gap: 6px; }

.row-logic { display: flex; justify-content: center; }

.row-fields {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}

.field-select, .op-select, .value-input {
  padding: 8px 12px; border: 1px solid var(--border-input); border-radius: 8px;
  font-size: 14px; background: var(--bg-input); color: var(--text-primary);
}
.field-select { min-width: 100px; }
.op-select { min-width: 80px; }
.value-input { min-width: 80px; max-width: 120px; }
.value-input.small { min-width: 60px; max-width: 80px; }

.range-sep { color: var(--text-muted); font-size: 14px; }
.unit { font-size: 13px; color: var(--text-muted); }

.btn-remove {
  background: none; border: none; color: #f44336; font-size: 16px;
  cursor: pointer; padding: 4px 8px; border-radius: 6px;
}
.btn-remove:hover { background: rgba(244, 67, 54, 0.1); }

.btn-add-condition {
  background: none; border: 1px dashed var(--border-input); border-radius: 8px;
  padding: 8px; font-size: 13px; color: var(--text-muted); cursor: pointer;
}
.btn-add-condition:hover { border-color: var(--text-muted); color: var(--text-secondary); }

.btn-add-group {
  background: none; border: 1px dashed var(--border-input); border-radius: 10px;
  padding: 10px; font-size: 14px; color: var(--text-muted); cursor: pointer;
}
.btn-add-group:hover { border-color: var(--text-muted); color: var(--text-secondary); }
</style>
