/**
 * sensor-labels.ts
 * 센서 키 → 한글 레이블/단위 맵 + 룰 한 줄 요약 유틸
 */

export const SENSOR_LABELS: Record<string, string> = {
  temperature: '온도',
  humidity: '습도',
  co2: '이산화탄소',
  soil_moisture: '토양 수분',
  light: '조도',
  ph: 'pH',
  ec: 'EC',
  pressure: '기압',
  wind_speed: '풍속',
  rainfall: '강수량',
  uv: 'UV',
  leaf_wetness: '잎 습윤',
  // 확장: Alerts.vue에서 사용하는 키
  dew_point: '이슬점',
  dew_point_temp: '이슬점 온도',
  rain_rate: '강우 강도',
  rain_1h: '1시간 강우',
  rain_24h: '24시간 강우',
  uv_index: 'UV 지수',
  atmospheric_pressture: '기압',
  pressure_drop: '기압 변화',
  windspeed_avg: '평균 풍속',
  windspeed_gust: '돌풍 풍속',
  feellike_temp: '체감온도',
  heat_index: '열지수',
  windchill_index: '풍속냉각지수',
  temp_current_external: '외부 온도',
  temp_current_external_1: '외부 온도 1',
  temp_current_external_2: '외부 온도 2',
  temp_current_external_3: '외부 온도 3',
  humidity_outdoor: '외부 습도',
  humidity_outdoor_1: '외부 습도 1',
  humidity_outdoor_2: '외부 습도 2',
  humidity_outdoor_3: '외부 습도 3',
}

export const SENSOR_UNITS: Record<string, string> = {
  temperature: '°C',
  humidity: '%',
  co2: 'ppm',
  soil_moisture: '%',
  light: 'lux',
  ph: '',
  ec: 'mS/cm',
  pressure: 'hPa',
  wind_speed: 'm/s',
  rainfall: 'mm',
  uv: '',
  leaf_wetness: '',
  dew_point: '°C',
  dew_point_temp: '°C',
  rain_rate: 'mm/h',
  rain_1h: 'mm',
  rain_24h: 'mm',
  uv_index: '',
  atmospheric_pressture: 'hPa',
  pressure_drop: 'hPa',
  windspeed_avg: 'm/s',
  windspeed_gust: 'm/s',
  feellike_temp: '°C',
  heat_index: '°C',
  windchill_index: '°C',
  temp_current_external: '°C',
  temp_current_external_1: '°C',
  temp_current_external_2: '°C',
  temp_current_external_3: '°C',
  humidity_outdoor: '%',
  humidity_outdoor_1: '%',
  humidity_outdoor_2: '%',
  humidity_outdoor_3: '%',
}

/** 센서 키 → 한글 레이블 반환 (없으면 키 그대로) */
export function labelOf(key: string): string {
  return SENSOR_LABELS[key] ?? key
}

/** 센서 키 → 단위 반환 (없으면 빈 문자열) */
export function unitOf(key: string): string {
  return SENSOR_UNITS[key] ?? ''
}

/** 액션 키 → 한글 동작 설명 */
const ACTION_LABELS: Record<string, string> = {
  fan_on: '환풍기 ON',
  fan_off: '환풍기 OFF',
  irrigation_start: '관수 실행',
  irrigation_stop: '관수 중지',
  window_open: '창문 열기',
  window_close: '창문 닫기',
  heater_on: '난방기 ON',
  heater_off: '난방기 OFF',
  pump_on: '펌프 ON',
  pump_off: '펌프 OFF',
  light_on: '조명 ON',
  light_off: '조명 OFF',
  curtain_open: '커튼 열기',
  curtain_close: '커튼 닫기',
  opener_open: '개폐기 열기',
  opener_close: '개폐기 닫기',
}

const DEVICE_TYPE_ACTION_LABELS: Record<string, { on: string; off: string }> = {
  fan: { on: '환풍기 ON', off: '환풍기 OFF' },
  irrigation: { on: '관수 실행', off: '관수 중지' },
  opener_open: { on: '창문 열기', off: '창문 닫기' },
  opener_close: { on: '개폐기 닫기', off: '개폐기 열기' },
  heater: { on: '난방기 ON', off: '난방기 OFF' },
  light: { on: '조명 ON', off: '조명 OFF' },
}

export function actionOf(actionKey: string, deviceType?: string): string {
  if (deviceType && DEVICE_TYPE_ACTION_LABELS[deviceType]) {
    const isOn = actionKey.endsWith('_on') || actionKey === 'irrigation_start' || actionKey.endsWith('_open')
    return isOn ? DEVICE_TYPE_ACTION_LABELS[deviceType].on : DEVICE_TYPE_ACTION_LABELS[deviceType].off
  }
  return ACTION_LABELS[actionKey] ?? actionKey
}

/** 연산자 → 한글 기호 */
function operatorSymbol(op: string): string {
  switch (op) {
    case 'gt': return '>'
    case 'lt': return '<'
    case 'gte': return '≥'
    case 'lte': return '≤'
    case 'eq': return '='
    case 'between': return '범위'
    default: return op
  }
}

/**
 * 룰 한 줄 요약 텍스트 생성
 * 예: "온도 > 28°C → 환풍기 ON"
 * 예: "습도 between 60~80% → 관수 실행"
 */
export function oneLineRule(rule: {
  sensorKey: string
  operator: string
  threshold: number | [number, number]
  actionKey: string
  deviceType?: string
}): string {
  const label = labelOf(rule.sensorKey)
  const unit = unitOf(rule.sensorKey)
  const action = actionOf(rule.actionKey, rule.deviceType)

  let conditionPart: string
  if (rule.operator === 'between' && Array.isArray(rule.threshold)) {
    conditionPart = `${label} ${rule.threshold[0]}~${rule.threshold[1]}${unit}`
  } else {
    const sym = operatorSymbol(rule.operator)
    conditionPart = `${label} ${sym} ${rule.threshold}${unit}`
  }

  return `${conditionPart} → ${action}`
}

/**
 * 환경 점수 기반 행동 권고 문자열
 * score: 0~100
 * worst: 가장 나쁜 센서 키
 */
export function envActionFor(score: number, worst: string): string {
  if (score >= 80) return '환경 양호 🟢'
  if (score >= 60) {
    const label = labelOf(worst)
    return `${label} 확인 필요 🟡`
  }
  if (score >= 40) {
    const label = labelOf(worst)
    return `${label} 주의 🟠`
  }
  const label = labelOf(worst)
  return `${label} 위험 🔴`
}
