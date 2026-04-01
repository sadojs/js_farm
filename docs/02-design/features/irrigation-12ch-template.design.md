# Design: 관수 12채널 템플릿 + 자동 채널 감지

> Plan: `docs/01-plan/features/irrigation-12ch-template.plan.md`

## 1. 핵심 설계 원칙

- `ChannelMapping` 타입을 8ch 고정에서 **동적 zone 수** 지원으로 변경
- 채널 수 판별은 **장비의 switchStates 키 개수**로 결정 (Tuya API 추가 호출 불필요)
- 기존 8ch 장비는 그대로 동작 (하위 호환)

## 2. Backend 변경

### 2-1. channel-mapping.constants.ts

```typescript
// 8채널 기본 매핑 (기존)
export const DEFAULT_CHANNEL_MAPPING_8CH: Record<string, string> = {
  remote_control:       'switch_1',
  zone_1:               'switch_2',
  zone_2:               'switch_3',
  zone_3:               'switch_4',
  zone_4:               'switch_5',
  fertilizer_b_contact: 'switch_6',
  mixer:                'switch_usb1',
  fertilizer_motor:     'switch_usb2',
};

// 12채널 기본 매핑 (신규)
export const DEFAULT_CHANNEL_MAPPING_12CH: Record<string, string> = {
  remote_control:       'switch_1',
  zone_1:               'switch_2',
  zone_2:               'switch_3',
  zone_3:               'switch_4',
  zone_4:               'switch_5',
  zone_5:               'switch_6',
  zone_6:               'switch_7',
  zone_7:               'switch_8',
  zone_8:               'switch_9',
  fertilizer_b_contact: 'switch_10',
  mixer:                'switch_usb1',
  fertilizer_motor:     'switch_usb2',
};

// 하위 호환용 별칭
export const DEFAULT_CHANNEL_MAPPING = DEFAULT_CHANNEL_MAPPING_8CH;

export const FUNCTION_LABELS: Record<string, string> = {
  remote_control:       '원격제어 ON/OFF',
  fertilizer_b_contact: '액비/교반기 B접점',
  zone_1:               '1구역 관수',
  zone_2:               '2구역 관수',
  zone_3:               '3구역 관수',
  zone_4:               '4구역 관수',
  zone_5:               '5구역 관수',
  zone_6:               '6구역 관수',
  zone_7:               '7구역 관수',
  zone_8:               '8구역 관수',
  mixer:                '교반기',
  fertilizer_motor:     '액비모터',
};

export const AVAILABLE_SWITCH_CODES_8CH = [
  'switch_1', 'switch_2', 'switch_3', 'switch_4',
  'switch_5', 'switch_6', 'switch_usb1', 'switch_usb2',
];

export const AVAILABLE_SWITCH_CODES_12CH = [
  'switch_1', 'switch_2', 'switch_3', 'switch_4',
  'switch_5', 'switch_6', 'switch_7', 'switch_8',
  'switch_9', 'switch_10', 'switch_usb1', 'switch_usb2',
];

// 하위 호환용 별칭
export const AVAILABLE_SWITCH_CODES = AVAILABLE_SWITCH_CODES_8CH;

/**
 * switch 코드 목록에서 채널 수 판별.
 * switch_7 이상이 존재하면 12ch, 아니면 8ch.
 */
export function detectChannelCount(switchCodes: string[]): 8 | 12 {
  return switchCodes.some(c => /^switch_(7|8|9|10)$/.test(c)) ? 12 : 8;
}

export function getDefaultMappingByCount(count: 8 | 12) {
  return count === 12 ? DEFAULT_CHANNEL_MAPPING_12CH : DEFAULT_CHANNEL_MAPPING_8CH;
}

export function getAvailableSwitchCodesByCount(count: 8 | 12) {
  return count === 12 ? AVAILABLE_SWITCH_CODES_12CH : AVAILABLE_SWITCH_CODES_8CH;
}
```

### 2-2. devices.service.ts — getEffectiveMapping 수정

```typescript
// Before
getEffectiveMapping(device: Device): Record<string, string> {
  return device.channelMapping ?? DEFAULT_CHANNEL_MAPPING;
}

// After
getEffectiveMapping(device: Device, switchCodes?: string[]): Record<string, string> {
  if (device.channelMapping) return device.channelMapping;
  const count = switchCodes ? detectChannelCount(switchCodes) : 8;
  return getDefaultMappingByCount(count);
}
```

### 2-3. irrigation-scheduler.service.ts — ZONE_FUNCTION_KEY 확장

```typescript
// Before (4개)
const ZONE_FUNCTION_KEY: Record<number, string> = {
  1: 'zone_1', 2: 'zone_2', 3: 'zone_3', 4: 'zone_4',
};

// After (8개)
const ZONE_FUNCTION_KEY: Record<number, string> = {
  1: 'zone_1', 2: 'zone_2', 3: 'zone_3', 4: 'zone_4',
  5: 'zone_5', 6: 'zone_6', 7: 'zone_7', 8: 'zone_8',
};
```

buildTimeline에서 매핑에 해당 zone 키가 있을 때만 동작 (8ch면 zone_5~8 키 없어서 자동 스킵).

## 3. Frontend 변경

### 3-1. types/device.types.ts

```typescript
// Before: ChannelMapping 고정 4 zone
export interface ChannelMapping {
  remote_control: string
  fertilizer_b_contact: string
  zone_1: string
  zone_2: string
  zone_3: string
  zone_4: string
  mixer: string
  fertilizer_motor: string
}

// After: 8 zone까지 지원 (zone_5~8은 optional)
export interface ChannelMapping {
  remote_control: string
  fertilizer_b_contact: string
  zone_1: string
  zone_2: string
  zone_3: string
  zone_4: string
  zone_5?: string
  zone_6?: string
  zone_7?: string
  zone_8?: string
  mixer: string
  fertilizer_motor: string
}

// 8ch/12ch 기본 매핑
export const DEFAULT_CHANNEL_MAPPING_8CH: ChannelMapping = { ... }
export const DEFAULT_CHANNEL_MAPPING_12CH: ChannelMapping = { ... }

// 하위 호환
export const DEFAULT_CHANNEL_MAPPING = DEFAULT_CHANNEL_MAPPING_8CH;

// switch 코드 목록
export const AVAILABLE_SWITCH_CODES_8CH = [...]
export const AVAILABLE_SWITCH_CODES_12CH = [...]
export const AVAILABLE_SWITCH_CODES = AVAILABLE_SWITCH_CODES_8CH;

// FUNCTION_LABELS에 zone_5~8 추가
export const FUNCTION_LABELS: Record<string, string> = {
  ...기존...,
  zone_5: '5구역 관수',
  zone_6: '6구역 관수',
  zone_7: '7구역 관수',
  zone_8: '8구역 관수',
}

// 채널 감지 유틸
export function detectChannelCount(switchCodes: string[]): 8 | 12 { ... }
export function getDefaultMappingByCount(count: 8 | 12): ChannelMapping { ... }
export function getAvailableSwitchCodesByCount(count: 8 | 12): string[] { ... }
```

### 3-2. stores/device.store.ts

```typescript
// Before
function getEffectiveMapping(device: Device): ChannelMapping {
  return (device.channelMapping as ChannelMapping) ?? DEFAULT_CHANNEL_MAPPING
}

// After
function getEffectiveMapping(device: Device): ChannelMapping {
  if (device.channelMapping) return device.channelMapping as ChannelMapping
  const count = device.switchStates
    ? detectChannelCount(Object.keys(device.switchStates))
    : 8
  return getDefaultMappingByCount(count)
}
```

### 3-3. StepIrrigationCondition.vue — 동적 zone 수

```html
<!-- Before: 고정 4 zone -->
<div v-for="zone in form.zones.filter(z => z.zone <= 4)" :key="zone.zone">

<!-- After: 매핑에 존재하는 zone만 표시 -->
<div v-for="zone in form.zones.filter(z => `zone_${z.zone}` in effectiveMapping)" :key="zone.zone">
```

### 3-4. Devices.vue, Groups.vue — 채널 매핑 패널

`MAPPING_FUNCTION_KEYS`를 고정 배열에서 **장비의 실제 매핑 키 목록**으로 동적 변경:

```typescript
// Before
const MAPPING_FUNCTION_KEYS = Object.keys(DEFAULT_CHANNEL_MAPPING) as (keyof ChannelMapping)[]

// After: 장비별 동적 키
function getMappingKeys(device: Device): string[] {
  const mapping = deviceStore.getEffectiveMapping(device)
  return Object.keys(mapping)
}
```

"기본값 복원" 버튼도 장비 채널 수에 맞는 기본값으로 복원:

```typescript
// Before
editMappings.value[device.id] = { ...DEFAULT_CHANNEL_MAPPING }

// After
const count = device.switchStates ? detectChannelCount(Object.keys(device.switchStates)) : 8
editMappings.value[device.id] = { ...getDefaultMappingByCount(count) }
```

AVAILABLE_SWITCH_CODES 드롭다운도 채널 수에 따라 분기:

```typescript
// Before
AVAILABLE_SWITCH_CODES (8개 고정)

// After
const switchCodesForDevice = computed(() =>
  getAvailableSwitchCodesByCount(currentChannelCount.value)
)
```

## 4. 구현 순서

```
1. backend/channel-mapping.constants.ts — 12ch 상수 + detectChannelCount 함수
2. backend/devices.service.ts — getEffectiveMapping에 switchCodes 파라미터
3. backend/irrigation-scheduler.service.ts — ZONE_FUNCTION_KEY 8개로 확장
4. frontend/types/device.types.ts — ChannelMapping 확장, 12ch 상수, 유틸 함수
5. frontend/stores/device.store.ts — getEffectiveMapping 채널 감지
6. frontend/StepIrrigationCondition.vue — zone 필터 동적화
7. frontend/Devices.vue — 매핑 패널 동적 키 + 기본값 복원 분기
8. frontend/Groups.vue — Devices.vue와 동일 패턴 적용
```

## 5. 체크리스트

- [ ] 8ch 장비: 기존과 동일하게 동작 (하위 호환)
- [ ] 12ch 장비: zone_1~8 + switch_1~10 + usb1/2 정상 표시
- [ ] DB channel_mapping이 NULL인 장비: switchStates에서 자동 감지
- [ ] DB channel_mapping이 저장된 장비: 저장된 값 그대로 사용
- [ ] 자동화 룰: StepIrrigationCondition에서 8개 zone 정상 표시
- [ ] 채널 매핑 편집: 드롭다운에 12ch switch 코드 목록
- [ ] 기본값 복원: 8ch/12ch 맞는 기본값으로 복원
- [ ] irrigation-scheduler: zone_5~8 타임라인 정상 생성
