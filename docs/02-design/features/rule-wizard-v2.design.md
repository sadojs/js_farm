# Rule Wizard V2 Design Document

> **Summary**: 의도 기반(Intent-first) 자동제어 룰 위저드 — 독립 모듈 설계
>
> **Project**: Smart Farm Platform
> **Author**: katsuhisa91
> **Date**: 2026-04-27
> **Status**: Draft
> **Plan**: [rule-wizard-v2.plan.md](../../01-plan/features/rule-wizard-v2.plan.md)

---

## 1. 기존 코드 분석 결과

### 1.1 CreateRuleRequest (기존 API DTO)

```typescript
// frontend/src/types/automation.types.ts 정독 결과
interface CreateRuleRequest {
  name: string
  description?: string
  groupId?: string
  houseId?: string
  conditions: ConditionGroup | IrrigationConditions
  actions: RuleAction
  priority?: number
}

interface RuleAction {
  targetDeviceId?: string       // 첫 번째 장치 (레거시)
  targetDeviceIds?: string[]    // 복수 장치 ID
  sensorDeviceIds?: string[]    // 센서 ID (V2에서는 빈 배열)
}

// 관수 전용 조건 구조
interface IrrigationConditions {
  type: 'irrigation'
  startTime: string             // "HH:MM"
  zones: IrrigationZoneConfig[] // 구역별 설정
  mixer: { enabled: boolean }
  fertilizer: { enabled: boolean; duration: number; preStopWait: number }
  schedule: { days: number[]; repeat: boolean }
}

interface IrrigationZoneConfig {
  zone: number     // 1-based
  name: string
  duration: number // 분
  waitTime: number
  enabled: boolean
}

// 일반 조건 구조 (개폐기/환풍기)
interface ConditionGroup {
  logic: 'AND' | 'OR'
  groups: ConditionSet[]        // 상위 그룹 배열
}

interface ConditionSet {
  logic: 'AND' | 'OR'
  conditions: Condition[]
}

interface Condition {
  type: 'time' | 'sensor' | 'weather'
  field: string
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between'
  value: number | boolean | string | [number, number]
  daysOfWeek?: number[]         // 시간 조건 시 요일 배열
  unit?: string
}
```

### 1.2 장치 타입 구조

```typescript
// frontend/src/types/device.types.ts 정독 결과
type EquipmentType = 'fan' | 'irrigation' | 'opener_open' | 'opener_close' | 'other'

interface Device {
  id: string
  name: string
  deviceType: 'sensor' | 'actuator'
  equipmentType?: EquipmentType
  switchStates?: Record<string, boolean>  // switch_1, switch_2, ...
  channelMapping?: ChannelMapping | null
  pairedDeviceId?: string                 // 개폐기 페어 연결
  openerGroupName?: string
  houseId?: string
}

// 채널 수 감지: switch_7~12 중 하나라도 있으면 12CH
function detectChannelCount(switchCodes: string[]): 8 | 12

// 12CH 매핑: switch_11=mixer, switch_12=fertilizer_motor
// 8CH 매핑: switch_usb1=mixer, switch_usb2=fertilizer_motor
```

### 1.3 개폐기 페어 구조

개폐기는 **두 개의 Device**로 구성:
- `equipmentType: 'opener_open'` — 열기 장치
- `equipmentType: 'opener_close'` — 닫기 장치, `pairedDeviceId`로 상호 참조

V2 위저드에서는 `opener_open` 장치를 대표 단위로 표시하고, 변환 레이어에서 페어까지 포함.

### 1.4 automation.store.createRule 시그니처

```typescript
async function createRule(payload: CreateRuleRequest): Promise<AutomationRule>
// 내부: automationApi.createRule(payload) → fetchRules()
```

### 1.5 Automation.vue 현황

- 버튼: `<button @click="openWizard()">+ 설정 추가</button>` (line 8)
- 모달 마운트: `<RuleWizardModal :visible="wizardOpen" .../>` (line 120)
- `openWizard()` 함수: wizardOpen = true, editingRule = rule || null (line 235)

---

## 2. 파일 구조 (신규)

```
frontend/src/
  components/automation/
    v2/
      types.ts                    ← V2 전용 타입
      transformV2ToLegacy.ts      ← V2→CreateRuleRequest 변환
      IntentWizardModal.vue       ← 루트 모달
      StepFarmSelect.vue
      StepIntentSelect.vue
      StepIrrigationDevice.vue
      StepIrrigationValve.vue
      StepDeviceByIntent.vue      ← 개폐기/환풍기 공용
      StepTimingByIntent.vue
      StepReviewSummary.vue
  composables/
    useRuleWizardV2.ts
  utils/
    ruleNameGenerator.ts
  i18n/locales/
    ko.ts                         ← wizardV2.* 키 추가 (기존 파일 수정)
  views/
    Automation.vue                ← 최소 수정 (5줄 내외)
```

---

## 3. 타입 정의 (`v2/types.ts`)

```typescript
export type WizardIntent = 'irrigation' | 'opener' | 'fan' | 'advanced'

export type WizardStep =
  | 'farm'
  | 'intent'
  | 'irrigation-device'
  | 'irrigation-valve'
  | 'device-by-intent'
  | 'timing'
  | 'review'

export interface IntentConfig {
  id: WizardIntent
  icon: string
  title: string
  subtitle: string
}

export const INTENTS: IntentConfig[] = [
  { id: 'irrigation', icon: '💧', title: '물(액비)을 주고 싶어요',     subtitle: '정해진 시간에 관수, 액비 혼합' },
  { id: 'opener',     icon: '🚪', title: '개폐기를 열거나 닫고 싶어요', subtitle: '시간·온도에 따라 자동 개폐' },
  { id: 'fan',        icon: '🌀', title: '환풍기를 켜거나 끄고 싶어요', subtitle: '시간·온도에 따라 자동 가동' },
  { id: 'advanced',   icon: '🌡️', title: '온도/습도에 따라 세밀하게 제어', subtitle: '조건을 직접 설정 (고급)' },
]

export interface SensorCondition {
  field: 'humidity' | 'co2' | 'soil_moisture' | 'light'
  operator: 'gte' | 'lte'
  value: number
}

export interface IrrigationSchedule {
  days: number[]       // 0(일)~6(토)
  startTime: string    // "HH:MM"
  durationMin: number
}

export interface ValveConfig {
  zoneIndex: number    // 1-based 구역 번호
  enabled: boolean
  durationMin: number  // 기본값 = IrrigationSchedule.durationMin과 공유
}

export interface FertilizerConfig {
  enabled: boolean
  duration: number     // 분
  preStopWait: number  // 종료 전 대기 분
}

export interface TimeRange {
  days: number[]
  start: string        // "HH:MM"
  end: string          // "HH:MM"
}

export interface TemperatureTrigger {
  base: number         // 기준 온도
  hysteresis: number   // 편차 (기본 2)
  // onAt = base + hysteresis, offAt = base - hysteresis
}

export interface WizardStateV2 {
  groupId: string | null

  intent: WizardIntent | null

  irrigation?: {
    controllerDeviceId: string
    controllerChannels: 8 | 12
    canMixFertilizer: boolean
    valveZones: number[]         // 선택된 구역 번호 배열 (1-based)
    valveDurationMin: number     // 모든 구역 공통 지속 시간
    useFertilizer: boolean
    fertilizer: FertilizerConfig
    schedule: IrrigationSchedule[]
  }

  opener?: {
    deviceIds: string[]          // opener_open 장치 ID 복수
    triggerType: 'time' | 'temperature'
    timeRange?: TimeRange
    temperature?: TemperatureTrigger
    extraConditions: SensorCondition[]
  }

  fan?: {
    deviceIds: string[]          // fan 장치 ID 복수
    triggerType: 'time' | 'temperature'
    timeRange?: TimeRange
    temperature?: TemperatureTrigger
    extraConditions: SensorCondition[]
  }

  ruleName: string
  activateNow: boolean
}
```

---

## 4. `useRuleWizardV2.ts` 설계

```typescript
export function useRuleWizardV2() {
  const state = ref<WizardStateV2>({
    groupId: null, intent: null, ruleName: '', activateNow: true,
  })
  const currentStep = ref<WizardStep>('farm')

  // 스텝 순서 (intent에 따라 동적)
  const stepOrder = computed((): WizardStep[] => {
    const base: WizardStep[] = ['farm', 'intent']
    switch (state.value.intent) {
      case 'irrigation':
        return [...base, 'irrigation-device', 'irrigation-valve', 'timing', 'review']
      case 'opener':
      case 'fan':
        return [...base, 'device-by-intent', 'timing', 'review']
      default:
        return base
    }
  })

  const totalSteps = computed(() =>
    state.value.intent === 'irrigation' ? 5 : 4
  )

  // 현재 스텝 인덱스 (진행률 점용)
  const stepIndex = computed(() =>
    stepOrder.value.indexOf(currentStep.value)
  )

  function next() {
    const order = stepOrder.value
    const idx = order.indexOf(currentStep.value)
    if (idx < order.length - 1) currentStep.value = order[idx + 1]
  }

  function prev() {
    const order = stepOrder.value
    const idx = order.indexOf(currentStep.value)
    if (idx > 0) currentStep.value = order[idx - 1]
  }

  function goTo(step: WizardStep) { currentStep.value = step }

  function reset() {
    state.value = { groupId: null, intent: null, ruleName: '', activateNow: true }
    currentStep.value = 'farm'
  }

  const canProceed = computed((): boolean => {
    switch (currentStep.value) {
      case 'farm':              return !!state.value.groupId
      case 'intent':            return !!state.value.intent
      case 'irrigation-device': return !!state.value.irrigation?.controllerDeviceId
      case 'irrigation-valve':  return (state.value.irrigation?.valveZones.length ?? 0) > 0
      case 'device-by-intent':
        return state.value.intent === 'opener'
          ? (state.value.opener?.deviceIds.length ?? 0) > 0
          : (state.value.fan?.deviceIds.length ?? 0) > 0
      case 'timing':
        if (state.value.intent === 'irrigation') {
          const s = state.value.irrigation?.schedule ?? []
          return s.length > 0 && s.every(sc => sc.days.length > 0 && sc.durationMin > 0)
        }
        const trigger = state.value.intent === 'opener'
          ? state.value.opener
          : state.value.fan
        if (!trigger) return false
        if (trigger.triggerType === 'time') {
          const t = trigger.timeRange
          return !!(t && t.days.length > 0 && t.start && t.end && t.start < t.end)
        }
        return !!(trigger.temperature?.base != null && trigger.temperature.hysteresis >= 0.5)
      case 'review':            return !!state.value.ruleName.trim()
      default:                  return false
    }
  })

  return { state, currentStep, stepIndex, totalSteps, stepOrder, canProceed, next, prev, goTo, reset }
}
```

---

## 5. `transformV2ToLegacy.ts` 설계

### 5.1 관수(irrigation) 변환

V2 `schedule[]` 배열이 복수이면 → 첫 번째 항목으로 하나의 룰 생성. 추가 시간대는 별도 룰 생성이 필요하나, 현재 구현에서는 첫 번째 항목만 적용하고 `metadata`에 원본 보존.

```typescript
function buildIrrigationPayload(state: WizardStateV2): CreateRuleRequest {
  const { groupId, ruleName, activateNow, irrigation } = state
  const sched = irrigation!.schedule[0]
  const channelMapping = irrigation!.controllerChannels === 12
    ? DEFAULT_CHANNEL_MAPPING_12CH : DEFAULT_CHANNEL_MAPPING_8CH

  // 선택된 구역만 enabled:true, 나머지 false
  const zones: IrrigationZoneConfig[] = Array.from({ length: irrigation!.controllerChannels <= 8 ? 8 : 8 }, (_, i) => ({
    zone: i + 1,
    name: `${i + 1}번 밸브`,
    duration: irrigation!.valveZones.includes(i + 1) ? irrigation!.valveDurationMin : 0,
    waitTime: 0,
    enabled: irrigation!.valveZones.includes(i + 1),
  }))

  const conditions: IrrigationConditions = {
    type: 'irrigation',
    startTime: sched.startTime,
    zones,
    mixer: { enabled: irrigation!.useFertilizer },
    fertilizer: irrigation!.useFertilizer
      ? { enabled: true, duration: irrigation!.fertilizer.duration, preStopWait: irrigation!.fertilizer.preStopWait }
      : { enabled: false, duration: 0, preStopWait: 0 },
    schedule: { days: sched.days, repeat: true },
  }

  return {
    name: ruleName,
    groupId: groupId ?? undefined,
    conditions,
    actions: {
      targetDeviceId: irrigation!.controllerDeviceId,
      targetDeviceIds: [irrigation!.controllerDeviceId],
      sensorDeviceIds: [],
    },
    priority: 1,
  }
}
```

### 5.2 개폐기/환풍기 시간 기반 변환

```typescript
function buildTimeCondition(timeRange: TimeRange): ConditionGroup {
  // "HH:MM" → 분으로 변환
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return {
    logic: 'AND',
    groups: [{
      logic: 'AND',
      conditions: [{
        type: 'time',
        field: 'time',
        operator: 'between',
        value: [toMin(timeRange.start), toMin(timeRange.end)] as [number, number],
        daysOfWeek: timeRange.days,
      }],
    }],
  }
}
```

### 5.3 개폐기/환풍기 온도 기반 변환 (히스테리시스)

백엔드는 단일 `gte` 조건으로 ON 임계값만 표현. OFF 임계값은 `metadata`에 보존.

```typescript
function buildTemperatureCondition(temp: TemperatureTrigger, extra: SensorCondition[]): ConditionGroup {
  const mainCond: Condition = {
    type: 'sensor',
    field: 'temperature',
    operator: 'gte',
    value: temp.base + temp.hysteresis,
    unit: '°C',
  }
  const extraConds: Condition[] = extra.map(ec => ({
    type: 'sensor',
    field: ec.field,
    operator: ec.operator,
    value: ec.value,
  }))
  return {
    logic: 'AND',
    groups: [{
      logic: 'AND',
      conditions: [mainCond, ...extraConds],
    }],
  }
}
```

### 5.4 개폐기 actions 변환

개폐기는 `opener_open` 장치 ID만 `targetDeviceIds`에 넣음. 백엔드의 인터록 로직이 pairedDevice 처리 담당.

```typescript
// opener
actions: {
  targetDeviceId: deviceIds[0],
  targetDeviceIds: deviceIds,  // opener_open ID 복수
  sensorDeviceIds: [],
}
```

### 5.5 전체 변환 함수 시그니처

```typescript
export function transformV2ToLegacy(state: WizardStateV2): CreateRuleRequest
// enabled 필드는 CreateRuleRequest에 없음 — store.createRule() 후 toggleRule()로 처리하거나
// 백엔드 기본값이 enabled:true 이므로 activateNow:false 시 생성 직후 toggleRule() 호출
```

---

## 6. `ruleNameGenerator.ts` 설계

```typescript
export function generateRuleName(state: WizardStateV2): string {
  const { intent } = state

  function dayLabel(days: number[]): string {
    const sorted = [...days].sort()
    if (sorted.length === 7) return '매일'
    if (JSON.stringify(sorted) === JSON.stringify([1,2,3,4,5])) return '평일'
    if (JSON.stringify(sorted) === JSON.stringify([0,6])) return '주말'
    const names = ['일','월','화','수','목','금','토']
    return sorted.map(d => names[d]).join('·')
  }

  function timeLabel(hhmm: string): string {
    const h = parseInt(hhmm.split(':')[0])
    if (h >= 6 && h < 12)  return '오전'
    if (h >= 12 && h < 18) return '오후'
    if (h >= 18 && h < 23) return '저녁'
    return '야간'
  }

  if (intent === 'irrigation' && state.irrigation) {
    const sched = state.irrigation.schedule[0]
    const day = dayLabel(sched?.days ?? [])
    const time = timeLabel(sched?.startTime ?? '00:00')
    const fert = state.irrigation.useFertilizer ? '액비 ' : ''
    return `${day} ${time} ${fert}관수`
  }

  if (intent === 'opener') {
    const trigger = state.opener
    if (trigger?.triggerType === 'time' && trigger.timeRange) {
      const day = dayLabel(trigger.timeRange.days)
      const startH = parseInt(trigger.timeRange.start.split(':')[0])
      const label = (startH >= 6 && startH < 18) ? '주간' : '야간'
      return `${day === '매일' ? '' : day + ' '}${label} 개폐기 자동 개방`
    }
    if (trigger?.triggerType === 'temperature' && trigger.temperature) {
      return `고온시 개폐기 자동 개방`
    }
  }

  if (intent === 'fan') {
    const trigger = state.fan
    if (trigger?.triggerType === 'time' && trigger.timeRange) {
      const day = dayLabel(trigger.timeRange.days)
      const startH = parseInt(trigger.timeRange.start.split(':')[0])
      const label = (startH >= 6 && startH < 18) ? '주간' : '야간'
      return `${day === '매일' ? '' : day + ' '}${label} 환풍기 가동`
    }
    if (trigger?.triggerType === 'temperature' && trigger.temperature) {
      return `고온시 환풍기 자동 가동`
    }
  }

  return '새 자동 제어'
}
```

---

## 7. 컴포넌트 인터페이스 설계

### 7.1 IntentWizardModal.vue

```typescript
// Props
defineProps<{ /* 없음, v-if로 마운트/언마운트 제어 */ }>()

// Emits
defineEmits<{
  close: []
  'switch-to-legacy': []   // 고급 모드 폴백 요청
  saved: [ruleName: string]
}>()
```

**렌더링 구조:**
```
<Teleport to="body">
  <div class="iwm-overlay" @click.self="handleOverlayClick">
    <div class="iwm-container">
      <!-- 헤더 -->
      <div class="iwm-header">
        <button aria-label="닫기">✕</button>
        <div class="iwm-dots" role="progressbar" aria-label="진행률">
          <span v-for="i in totalSteps" :class="{ active: i-1 <= stepIndex }">●</span>
        </div>
        <div style="width:44px" />  <!-- 균형용 빈 공간 -->
      </div>

      <!-- 본문 -->
      <div class="iwm-body">
        <component :is="currentStepComponent" ... />
      </div>

      <!-- 푸터 -->
      <div class="iwm-footer">
        <button v-if="showPrev" @click="wizard.prev()">← 이전</button>
        <div class="spacer" />
        <button v-if="showNext" :disabled="!wizard.canProceed" @click="handleNext">
          {{ nextLabel }}
        </button>
      </div>
    </div>
  </div>
</Teleport>
```

**스텝별 푸터 버튼:**
| 스텝 | 이전 버튼 | 다음 버튼 레이블 | 자동 진행 |
|------|-----------|-----------------|-----------|
| farm | 없음 | 없음 | 선택 즉시 next() |
| intent | 없음 | 없음 | 선택 즉시 next() (0.2s 딜레이) |
| irrigation-device | 없음 | 없음 | 선택 즉시 next() (0.2s 딜레이) |
| irrigation-valve | ← 이전 | 다음 | 없음 |
| device-by-intent | ← 이전 | 장치 선택 완료 | 없음 |
| timing | ← 이전 | 설정 완료 | 없음 |
| review | ← 이전 | ✓ 만들기 | 없음 |

### 7.2 StepFarmSelect.vue

```typescript
const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [v: string]; proceed: [] }>()

// 마운트 시 groups 확인, 1개면 자동 선택 + emit('proceed')
// 2개 이상: 라디오 리스트, 클릭 즉시 emit('proceed')
// 표시 정보: 그룹명, 장치 수 (group.devices.length)
```

### 7.3 StepIntentSelect.vue

```typescript
const props = defineProps<{ modelValue: WizardIntent | null }>()
const emit = defineEmits<{
  'update:modelValue': [v: WizardIntent]
  proceed: []
  'switch-to-legacy': []
}>()

// 선택 시 → 0.2s 후 emit('proceed')
// 'advanced' → emit('switch-to-legacy')
```

### 7.4 StepIrrigationDevice.vue

```typescript
interface IrrigationControllerInfo {
  deviceId: string
  name: string
  channelCount: 8 | 12
  canMixFertilizer: boolean
  groupName: string
}

const props = defineProps<{
  groupId: string
  modelValue: string | null  // controllerDeviceId
}>()
const emit = defineEmits<{
  'update:modelValue': [deviceId: string]
  select: [info: IrrigationControllerInfo]  // 채널 수 등 메타 포함
  proceed: []
}>()

// 필터: equipmentType === 'irrigation'
// 채널 수: detectChannelCount(Object.keys(device.switchStates ?? {}))
// 선택 → 0.2s 딜레이 → emit('proceed')
// 장치 없으면 <EmptyState />
```

### 7.5 StepIrrigationValve.vue

```typescript
const props = defineProps<{
  controllerChannels: 8 | 12
  canMixFertilizer: boolean
  modelValue: number[]           // 선택된 구역 번호 배열
  durationMin: number
  useFertilizer: boolean
  fertilizer: FertilizerConfig
}>()
const emit = defineEmits<{
  'update:modelValue': [zones: number[]]
  'update:durationMin': [v: number]
  'update:useFertilizer': [v: boolean]
  'update:fertilizer': [v: FertilizerConfig]
  'go-back': []              // 다른 관수 장치로 변경
}>()

// 밸브 개수: controllerChannels (8 또는 12)
// 2열 그리드 체크박스
// canMixFertilizer === true 일 때만 액비 옵션 노출
// IrrigationSequenceBuilder.vue 임포트 여부: 있다면 재활용, 없으면 간단 inline 구현
```

### 7.6 StepDeviceByIntent.vue

```typescript
const props = defineProps<{
  intent: 'opener' | 'fan'
  groupId: string
  modelValue: string[]   // 선택된 장치 ID 배열
}>()
const emit = defineEmits<{
  'update:modelValue': [ids: string[]]
}>()

// opener 필터: equipmentType === 'opener_open' (페어 대표)
// fan 필터: equipmentType === 'fan'
// 복수 체크박스, 동작 선택 UI 없음
// opener: 인터록 안내 문구 2개 표시
// fan: 안내 문구 1개 표시
```

### 7.7 StepTimingByIntent.vue

```typescript
const props = defineProps<{
  intent: 'irrigation' | 'opener' | 'fan'
  // irrigation
  schedule: IrrigationSchedule[]
  // opener/fan
  triggerType: 'time' | 'temperature'
  timeRange: TimeRange | undefined
  temperature: TemperatureTrigger | undefined
  extraConditions: SensorCondition[]
}>()
const emit = defineEmits<{
  'update:schedule': [v: IrrigationSchedule[]]
  'update:triggerType': [v: 'time' | 'temperature']
  'update:timeRange': [v: TimeRange]
  'update:temperature': [v: TemperatureTrigger]
  'update:extraConditions': [v: SensorCondition[]]
}>()
```

### 7.8 StepReviewSummary.vue

```typescript
const props = defineProps<{
  state: WizardStateV2
  groups: HouseGroup[]
  devices: Device[]
  saving: boolean
}>()
const emit = defineEmits<{
  'update:ruleName': [v: string]
  'update:activateNow': [v: boolean]
  'jump-to': [step: WizardStep]   // 섹션 클릭 시 스텝 이동
  save: []
}>()

// 자연어 요약 3개 섹션: 농장(farm), 장치(device), 시점(timing)
// 각 섹션 클릭 → emit('jump-to', targetStep)
// 룰 이름: 편집 가능 input (초기값 = generateRuleName(state))
// "바로 활성화" 체크박스 기본 체크
// "✓ 만들기" → emit('save')
```

---

## 8. Automation.vue 수정 명세 (최소)

```typescript
// 추가할 import
import IntentWizardModal from '../components/automation/v2/IntentWizardModal.vue'

// 추가할 ref
const showIntentWizard = ref(false)

// 수정할 함수 (신규 룰 생성 시만 V2 사용, 수정은 기존 V1 유지)
function openWizard(rule?: AutomationRule) {
  editingRule.value = rule || null
  if (!rule) {
    showIntentWizard.value = true  // 신규: V2
  } else {
    wizardOpen.value = true        // 수정: V1
  }
}

// switch-to-legacy 핸들러
function handleSwitchToLegacy() {
  showIntentWizard.value = false
  wizardOpen.value = true
}
```

```html
<!-- 템플릿에 추가 (RuleWizardModal 아래) -->
<IntentWizardModal
  v-if="showIntentWizard"
  @close="showIntentWizard = false"
  @switch-to-legacy="handleSwitchToLegacy"
  @saved="onRuleSaved"
/>
```

---

## 9. i18n 키 (`wizardV2.*`)

```typescript
// ko.ts 추가 키 목록
wizardV2: {
  intents: {
    irrigation: { title: '물(액비)을 주고 싶어요', subtitle: '정해진 시간에 관수, 액비 혼합' },
    opener:     { title: '개폐기를 열거나 닫고 싶어요', subtitle: '시간·온도에 따라 자동 개폐' },
    fan:        { title: '환풍기를 켜거나 끄고 싶어요', subtitle: '시간·온도에 따라 자동 가동' },
    advanced:   { title: '온도/습도에 따라 세밀하게 제어', subtitle: '조건을 직접 설정 (고급)' },
  },
  steps: {
    farm:    { title: '어느 농장에서 사용할까요?' },
    intent:  { title: '무엇을 하고 싶으세요?' },
    irrigationDevice: { title: '어느 관수 장치를 사용할까요?' },
    irrigationValve:  { title: '어느 밸브로 물을 줄까요?' },
    deviceOpener:     { title: '어느 개폐기를 자동 제어할까요?' },
    deviceFan:        { title: '어떤 환풍기를 자동 제어할까요?' },
    timing:           { title: '언제 작동할까요?' },
    review:           { title: '이렇게 만들까요?' },
  },
  actions: {
    next:     '다음',
    prev:     '이전',
    done:     '선택 완료',
    deviceDone: '장치 선택 완료',
    timingDone: '설정 완료',
    save:     '✓ 만들기',
    close:    '닫기',
  },
  labels: {
    activateNow:   '룰을 바로 활성화하기',
    ruleName:      '룰 이름',
    addSchedule:   '+ 시간대 추가',
    everyday:      '매일',
    changeDevice:  '다른 관수 장치로 변경',
    fertOnly:      '물만',
    fertMix:       '액비 혼합 (액상비료 같이)',
    timeTrigger:   '⏰ 시간으로',
    tempTrigger:   '🌡️ 온도로',
    baseTemp:      '기준 온도',
    deviation:     '편차',
    addCondition:  '+ 습도/CO2 조건도 추가하기',
  },
  hints: {
    openerInterlock: '안전을 위해 열림/닫힘은 1초 간격으로 순차 동작합니다.',
    openerAutoOff:   '다음 단계에서 설정한 시간/온도 조건이 만족되면 열리고, 벗어나면 자동으로 닫힙니다.',
    fanAutoOff:      '다음 단계에서 설정한 시간/온도 조건이 만족되면 켜지고, 벗어나면 자동으로 꺼집니다.',
  },
}
```

---

## 10. CSS 설계 원칙

### 10.1 모달 레이아웃

```css
.iwm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(8px);
  z-index: 1100;   /* RuleWizardModal z-index 1000보다 높게 */
  display: flex; align-items: center; justify-content: center;
}

.iwm-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  width: 100%; max-width: 560px;
  max-height: 90vh;
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-modal);
}

/* 모바일: 풀스크린 시트 */
@media (max-width: 600px) {
  .iwm-overlay { align-items: flex-end; }
  .iwm-container {
    max-width: 100%; width: 100%;
    max-height: 95vh;
    border-radius: 20px 20px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
}
```

### 10.2 의도 카드

```css
.intent-card {
  display: flex; align-items: center; gap: 16px;
  min-height: 72px;                    /* 터치 타겟 */
  padding: 16px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.intent-card:hover, .intent-card:focus-visible {
  border-color: var(--color-primary);
  background: var(--bg-secondary);
}
.intent-card:focus-visible { outline: 2px solid var(--color-primary); }
.intent-card.selected {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--bg-card));
}
```

### 10.3 진행률 점

```css
.iwm-dots { display: flex; gap: 8px; }
.iwm-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--border-color);
  transition: background 0.2s;
}
.iwm-dot.active { background: var(--color-primary); }
```

---

## 11. 구현 체크리스트

### Phase 1: 타입/유틸 (의존성 없음)
- [ ] `v2/types.ts` — WizardStateV2, WizardStep, INTENTS 등
- [ ] `utils/ruleNameGenerator.ts` — generateRuleName()
- [ ] `v2/transformV2ToLegacy.ts` — transformV2ToLegacy()
- [ ] `composables/useRuleWizardV2.ts` — 스텝 관리, canProceed

### Phase 2: Leaf 컴포넌트 (상호 독립)
- [ ] `StepIntentSelect.vue` — 의도 4개 카드
- [ ] `StepFarmSelect.vue` — 그룹 선택/자동 스킵
- [ ] `StepIrrigationDevice.vue` — 컨트롤러 단수 선택
- [ ] `StepIrrigationValve.vue` — 밸브 복수 + 액비
- [ ] `StepDeviceByIntent.vue` — 개폐기/환풍기 복수
- [ ] `StepTimingByIntent.vue` — 시간/온도 분기
- [ ] `StepReviewSummary.vue` — 자연어 요약

### Phase 3: 루트 모달
- [ ] `IntentWizardModal.vue` — 스텝 조합, 헤더/푸터

### Phase 4: 통합
- [ ] `Automation.vue` 5줄 수정
- [ ] `ko.ts` wizardV2 키 추가

### Phase 5: 검증
- [ ] `npm run build` 성공
- [ ] 시나리오 1~4 수동 검증
- [ ] 모바일 393px 레이아웃 확인
- [ ] `git diff backend/` = 0줄
- [ ] `git diff frontend/src/components/automation/RuleWizardModal.vue` = 0줄

---

## 12. 특수 케이스 처리

### 12.1 복수 시간대 관수

현재 `IrrigationConditions`는 단일 `startTime`만 지원.
→ V2에서 복수 시간대 추가 시: **첫 번째 시간대로 하나의 룰 생성**, 추가 시간대는 `metadata`에 보존 + UI 안내.
추후 백엔드 확장 시 메타데이터로 복원 가능.

### 12.2 enabled:false 생성

`CreateRuleRequest`에 `enabled` 필드 없음 → 기본값 `enabled:true`로 생성됨.
`activateNow === false` 시: 생성 직후 `automationStore.toggleRule(newRule.id)` 호출로 비활성화.

### 12.3 개폐기 복수 선택

장치 선택: `opener_open` 장치 ID 배열
변환: 해당 ID 그대로 `targetDeviceIds`에 포함 (백엔드 인터록 처리 담당)

### 12.4 IrrigationSequenceBuilder 재사용 여부

`frontend/src/components/automation/IrrigationSequenceBuilder.vue` 존재 확인됨.
→ StepIrrigationValve.vue에서 조건부 임포트하여 "액비 혼합" 선택 시 표시.
단, 해당 컴포넌트의 v-model 인터페이스가 `FertilizerConfig`와 다를 수 있으므로 구현 시 확인 후 어댑터 작성.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-27 | Initial design (기존 코드 정독 후 작성) | katsuhisa91 |
