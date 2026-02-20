import type {
  Condition, ConditionGroup, ConditionSet,
  WizardFormData, RuleAction,
} from '../types/automation.types'

// === 라벨 매핑 ===

export const FIELD_LABELS: Record<string, string> = {
  hour: '시간',
  once_at: '실행 시각',
  temperature: '온도',
  humidity: '습도',
  co2: 'CO2',
  light: '조도',
  soil_moisture: '토양 수분',
  ph: 'PH',
  ec: 'EC',
  rain: '비 센서',
}

export const FIELD_UNITS: Record<string, string> = {
  temperature: '°C',
  humidity: '%',
  co2: 'ppm',
  light: 'lux',
  soil_moisture: '%',
  ph: '',
  ec: 'mS/cm',
}

export const OPERATOR_LABELS: Record<string, string> = {
  eq: '=',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  between: '~',
}

export const OPERATOR_LABELS_KR: Record<string, string> = {
  eq: '같음',
  gt: '초과',
  lt: '미만',
  gte: '이상',
  lte: '이하',
  between: '사이',
}

// === 포맷 함수 ===

export function formatCondition(c: Condition): string {
  const fieldLabel = FIELD_LABELS[c.field] || c.field
  const unit = FIELD_UNITS[c.field] || c.unit || ''

  if (c.field === 'rain') {
    return `비 ${c.value ? '예' : '아니오'}`
  }

  if (c.field === 'hour') {
    if (c.operator === 'between' && Array.isArray(c.value)) {
      return `${String(c.value[0]).padStart(2, '0')}:00 ~ ${String(c.value[1]).padStart(2, '0')}:00`
    }
    return `${String(c.value).padStart(2, '0')}:00`
  }

  if (c.operator === 'between' && Array.isArray(c.value)) {
    return `${fieldLabel} ${c.value[0]}${unit} ~ ${c.value[1]}${unit}`
  }

  const op = OPERATOR_LABELS[c.operator] || c.operator
  return `${fieldLabel} ${op} ${c.value}${unit}`
}

export function formatConditionGroup(cg: ConditionGroup): string {
  if (!cg.groups || cg.groups.length === 0) return '조건 없음'

  const parts = cg.groups.map((set) => {
    const condStrs = set.conditions.map(formatCondition)
    return condStrs.length > 1
      ? `(${condStrs.join(` ${set.logic} `)})`
      : condStrs[0] || ''
  })

  return parts.join(` ${cg.logic} `)
}

export function formatAction(a: RuleAction): string {
  if (a.targetDeviceIds?.length) {
    const cmd = a.command === 'on' ? 'ON' : 'OFF'
    return `${a.targetDeviceIds.length}개 장비 ${cmd}`
  }
  return `${a.command}`
}

// === 기본값 생성 ===

export function createEmptyWizardForm(): WizardFormData {
  return {
    groupId: undefined,
    sensorDeviceIds: [],
    actuatorDeviceIds: [],
    actuatorCommand: 'on',
    conditions: { logic: 'AND', groups: [createEmptyConditionSet()] },
    name: '',
    description: '',
    priority: 5,
  }
}

export function createEmptyConditionSet(): ConditionSet {
  return {
    logic: 'AND',
    conditions: [createEmptyCondition()],
  }
}

export function createEmptyCondition(): Condition {
  return {
    type: 'sensor',
    field: 'temperature',
    operator: 'gte',
    value: 25,
    unit: '°C',
  }
}

export function createEmptyIrrigationStep() {
  return { type: 'water' as const, value: 10, unit: 'minutes' as const }
}

// === ruleType 자동 결정 ===

export function determineRuleType(conditions: ConditionGroup): 'weather' | 'time' | 'hybrid' {
  const types = new Set<string>()
  for (const group of conditions.groups || []) {
    for (const c of group.conditions || []) {
      types.add(c.type)
    }
  }
  const hasTime = types.has('time')
  const hasSensor = types.has('sensor') || types.has('weather')
  if (hasTime && hasSensor) return 'hybrid'
  if (hasTime) return 'time'
  return 'weather'
}

// === 조건 필드 정의 ===

export const SENSOR_CONDITION_FIELDS = [
  {
    value: 'temperature',
    label: '온도',
    type: 'sensor' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq', 'between'],
    unit: '°C',
    defaultValue: 25,
    icon: '🌡️',
  },
  {
    value: 'humidity',
    label: '습도',
    type: 'sensor' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq', 'between'],
    unit: '%',
    defaultValue: 60,
    icon: '💧',
  },
  {
    value: 'rain',
    label: '강우량',
    type: 'sensor' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'],
    unit: 'mm',
    defaultValue: 0,
    icon: '🌧️',
  },
  {
    value: 'uv',
    label: 'UV',
    type: 'sensor' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'],
    unit: 'index',
    defaultValue: 5,
    icon: '☀️',
  },
  {
    value: 'dew_point',
    label: '이슬점',
    type: 'sensor' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq', 'between'],
    unit: '°C',
    defaultValue: 15,
    icon: '💦',
  },
  {
    value: 'hour',
    label: '시간',
    type: 'time' as const,
    operators: ['eq', 'between'],
    unit: '',
    defaultValue: 9,
    icon: '🕐',
  },
]

// ---- 하위 호환 유틸 (ConditionRow/구버전 컴포넌트용) ----
export function getAllowedConditionFields(_deviceType: unknown) {
  return SENSOR_CONDITION_FIELDS
}

export function getAllowedOperators(_deviceType: unknown, field: string) {
  const def = SENSOR_CONDITION_FIELDS.find((f) => f.value === field)
  return def?.operators || ['eq']
}

export function normalizeConditionByDevice(condition: Condition, _deviceType: unknown): Condition {
  const def = SENSOR_CONDITION_FIELDS.find((f) => f.value === condition.field)
  if (!def) return condition

  let value = condition.value
  if (condition.field === 'rain') {
    value = typeof value === 'boolean' ? value : false
  } else if (condition.operator === 'between' && !Array.isArray(value)) {
    const base = Number(value) || 0
    value = [base, base + 10]
  } else if (condition.operator !== 'between' && Array.isArray(value)) {
    value = value[0]
  }

  return {
    ...condition,
    type: def.type,
    unit: def.unit || condition.unit,
    value,
  }
}
