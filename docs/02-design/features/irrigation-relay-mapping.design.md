# Design: 관수 장비 릴레이 채널 동적 매핑 (irrigation-relay-mapping)

## 개요
Plan 문서의 FR-01~FR-06을 기반으로 구체적인 구현 설계를 정의한다.

---

## 1. 상수 정의 (공통)

### DEFAULT_CHANNEL_MAPPING

백엔드/프론트엔드 공통으로 사용할 기본 매핑. 장비 DB에 `channel_mapping`이 없으면 이 값을 사용한다.

```typescript
// backend/src/modules/devices/channel-mapping.constants.ts (신규)
export const DEFAULT_CHANNEL_MAPPING: Record<string, string> = {
  remote_control:       'switch_1',
  fertilizer_b_contact: 'switch_6',
  zone_1:               'switch_2',
  zone_2:               'switch_3',
  zone_3:               'switch_4',
  zone_4:               'switch_5',
  mixer:                'switch_usb1',
  fertilizer_motor:     'switch_usb2',
};

export const FUNCTION_LABELS: Record<string, string> = {
  remote_control:       '원격제어 ON/OFF',
  fertilizer_b_contact: '액비/교반기 B접점',
  zone_1:               '1구역 관수',
  zone_2:               '2구역 관수',
  zone_3:               '3구역 관수',
  zone_4:               '4구역 관수',
  mixer:                '교반기',
  fertilizer_motor:     '액비모터',
};

// 선택 가능한 switch 코드 목록
export const AVAILABLE_SWITCH_CODES = [
  'switch_1', 'switch_2', 'switch_3', 'switch_4',
  'switch_5', 'switch_6', 'switch_usb1', 'switch_usb2',
];
```

---

## 2. DB 스키마 변경

### 2-1. Migration SQL

```sql
-- backend/database/schema.sql 추가
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS channel_mapping JSONB DEFAULT NULL;

COMMENT ON COLUMN devices.channel_mapping IS
  '관수 장비 릴레이 채널 커스텀 매핑. NULL이면 시스템 기본값 사용.
   형식: {"remote_control":"switch_1","fertilizer_b_contact":"switch_6",...}';
```

### 2-2. schema.sql devices 테이블 수정

```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  house_id UUID REFERENCES houses(id),
  tuya_device_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  device_type VARCHAR(50) NOT NULL,
  equipment_type VARCHAR(50),
  icon VARCHAR(50),
  paired_device_id UUID REFERENCES devices(id),
  opener_group_name VARCHAR(100),
  channel_mapping JSONB DEFAULT NULL,   -- ← 신규 추가
  online BOOLEAN DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, tuya_device_id)
);
```

---

## 3. Backend

### 3-1. Device 엔티티

```typescript
// backend/src/modules/devices/entities/device.entity.ts

@Column({ name: 'channel_mapping', type: 'jsonb', nullable: true })
channelMapping: Record<string, string> | null;
```

### 3-2. DevicesService - getEffectiveMapping 유틸

```typescript
// backend/src/modules/devices/devices.service.ts 에 추가

import { DEFAULT_CHANNEL_MAPPING } from './channel-mapping.constants';

/**
 * 장비의 유효 채널 매핑 반환.
 * DB에 저장된 값이 있으면 그것을 사용, 없으면 DEFAULT_CHANNEL_MAPPING 반환.
 */
getEffectiveMapping(device: Device): Record<string, string> {
  return device.channelMapping ?? DEFAULT_CHANNEL_MAPPING;
}

/**
 * 채널 매핑 업데이트 (admin / farm_admin 전용)
 */
async updateChannelMapping(
  deviceId: string,
  userId: string,
  userRole: string,
  mapping: Record<string, string>,
): Promise<Device> {
  // 권한 체크
  if (userRole !== 'admin' && userRole !== 'farm_admin') {
    throw new ForbiddenException('채널 매핑 수정 권한이 없습니다.');
  }

  const device = await this.devicesRepo.findOne({
    where: { id: deviceId, userId },
  });
  if (!device) throw new NotFoundException('장비를 찾을 수 없습니다.');
  if (device.equipmentType !== 'irrigation') {
    throw new BadRequestException('관수 장비만 채널 매핑을 설정할 수 있습니다.');
  }

  // 유효한 switch 코드만 허용
  const valid = new Set(AVAILABLE_SWITCH_CODES);
  for (const [fn, sw] of Object.entries(mapping)) {
    if (!valid.has(sw)) {
      throw new BadRequestException(`유효하지 않은 switch 코드: ${sw}`);
    }
  }

  device.channelMapping = mapping;
  return this.devicesRepo.save(device);
}
```

### 3-3. DevicesController - PATCH API

```typescript
// backend/src/modules/devices/devices.controller.ts 에 추가

import { Patch, ForbiddenException } from '@nestjs/common';

@Patch(':id/channel-mapping')
updateChannelMapping(
  @Param('id') id: string,
  @CurrentUser() user: any,
  @Body() body: { mapping: Record<string, string> },
) {
  const effectiveUserId =
    user.role === 'farm_user' && user.parentUserId
      ? user.parentUserId
      : user.id;
  return this.devicesService.updateChannelMapping(
    id,
    effectiveUserId,
    user.role,
    body.mapping,
  );
}
```

**API 명세:**
```
PATCH /api/devices/:id/channel-mapping
Authorization: Bearer {token}
Body: { "mapping": { "remote_control": "switch_1", ... } }

성공: 200 { ...device, channelMapping: {...} }
실패: 403 권한 없음 / 404 장비 없음 / 400 유효하지 않은 값
```

---

### 3-4. IrrigationSchedulerService - 동적 매핑 적용

**변경 전:**
```typescript
const ZONE_SWITCH_MAP: Record<number, string> = {
  1: 'switch_2', 2: 'switch_3', 3: 'switch_4', 4: 'switch_5', 5: 'switch_6',
};
// buildTimeline에서
const switchCode = ZONE_SWITCH_MAP[zone.zone];
// mixer 고정
switchCode: 'switch_usb1'
// fertilizer 고정
switchCode: 'switch_usb2'
```

**변경 후:**

```typescript
// ZONE_SWITCH_MAP 상수 제거

// startIrrigation에 device 매핑 전달
private async startIrrigation(rule: AutomationRule, conditions: any) {
  const device = await this.devicesRepo.findOne({ where: { id: deviceIds[0] } });
  // ...
  const mapping = this.devicesService.getEffectiveMapping(device);

  // 원격제어(remote_control) OFF 상태면 스케줄 스킵
  const remoteControlSwitch = mapping['remote_control'];
  const deviceStatus = await this.tuyaService.getDeviceStatus(tuyaCreds, device.tuyaDeviceId);
  const remoteControlOn = deviceStatus?.find(s => s.code === remoteControlSwitch)?.value === true;
  if (!remoteControlOn) {
    this.logger.log(`관수 스케줄 스킵: 원격제어 OFF (${rule.name})`);
    return;
  }

  const timeline = this.buildTimeline(conditions, mapping);
  // ...
}

// buildTimeline에 mapping 파라미터 추가
private buildTimeline(conditions: any, mapping: Record<string, string>): ScheduledAction[] {
  // zone_1~4 매핑
  const zoneKeyMap: Record<number, string> = { 1: 'zone_1', 2: 'zone_2', 3: 'zone_3', 4: 'zone_4' };
  // ...
  const switchCode = mapping[zoneKeyMap[zone.zone]];

  // mixer / fertilizer_motor 동적
  actions.push({
    switchCode: mapping['mixer'],        // 고정 'switch_usb1' 제거
    ...
  });
  actions.push({
    switchCode: mapping['fertilizer_motor'], // 고정 'switch_usb2' 제거
    ...
  });
}
```

> **주의**: 기존 zone 5는 더 이상 사용하지 않음 (`zone_1~4`만 지원). `fertilizer_b_contact`(switch_6)는 스케줄러가 아닌 원격제어 연동으로만 동작.

---

### 3-5. AutomationRunnerService - 원격제어 연동 로직

**원격제어(switch_1) ON/OFF 시 처리:**

관수 장비에 대한 `controlDevice` 호출이 들어올 때, 해당 switch가 `remote_control`에 매핑된 코드라면:

```typescript
// devices.service.ts controlDevice 메서드 내부 또는
// devices.controller.ts control 핸들러에서 처리

async controlDevice(deviceId: string, userId: string, commands: { code: string; value: any }[]) {
  const device = await this.devicesRepo.findOne({ where: { id: deviceId, userId } });
  // ...
  const mapping = this.getEffectiveMapping(device);
  const remoteControlSwitch = mapping['remote_control'];
  const fertilizer_b_switch = mapping['fertilizer_b_contact'];

  // remote_control 스위치 명령이 포함된 경우
  const remoteCmd = commands.find(c => c.code === remoteControlSwitch);
  if (remoteCmd && device.equipmentType === 'irrigation') {
    const extraCommands: { code: string; value: any }[] = [];

    if (remoteCmd.value === true) {
      // ON: fertilizer_b_contact도 ON
      extraCommands.push({ code: fertilizer_b_switch, value: true });
    } else {
      // OFF: fertilizer_b_contact도 OFF + 나머지 전부 OFF
      extraCommands.push({ code: fertilizer_b_switch, value: false });
      // zone_1~4, mixer, fertilizer_motor 모두 OFF
      for (const fn of ['zone_1','zone_2','zone_3','zone_4','mixer','fertilizer_motor']) {
        const sw = mapping[fn];
        if (sw) extraCommands.push({ code: sw, value: false });
      }
    }

    // 원격제어 명령 + 연동 명령 일괄 전송
    return this.tuyaService.sendDeviceCommand(tuyaCreds, device.tuyaDeviceId, [
      ...commands,
      ...extraCommands,
    ]);
  }

  // 일반 명령
  return this.tuyaService.sendDeviceCommand(tuyaCreds, device.tuyaDeviceId, commands);
}
```

---

## 4. Frontend

### 4-1. 타입 정의

```typescript
// frontend/src/stores/device.store.ts 상단 (또는 types/device.types.ts)

export interface ChannelMapping {
  remote_control: string;
  fertilizer_b_contact: string;
  zone_1: string;
  zone_2: string;
  zone_3: string;
  zone_4: string;
  mixer: string;
  fertilizer_motor: string;
}

export const DEFAULT_CHANNEL_MAPPING: ChannelMapping = {
  remote_control:       'switch_1',
  fertilizer_b_contact: 'switch_6',
  zone_1:               'switch_2',
  zone_2:               'switch_3',
  zone_3:               'switch_4',
  zone_4:               'switch_5',
  mixer:                'switch_usb1',
  fertilizer_motor:     'switch_usb2',
};

export const FUNCTION_LABELS: Record<keyof ChannelMapping, string> = {
  remote_control:       '원격제어 ON/OFF',
  fertilizer_b_contact: '액비/교반기 B접점',
  zone_1:               '1구역 관수',
  zone_2:               '2구역 관수',
  zone_3:               '3구역 관수',
  zone_4:               '4구역 관수',
  mixer:                '교반기',
  fertilizer_motor:     '액비모터',
};

export const AVAILABLE_SWITCH_CODES = [
  'switch_1','switch_2','switch_3','switch_4',
  'switch_5','switch_6','switch_usb1','switch_usb2',
];
```

### 4-2. device.store.ts 변경

```typescript
// Device 인터페이스에 추가
interface Device {
  // ... 기존 필드
  channelMapping?: ChannelMapping | null;
}

// 유효 매핑 getter
function getEffectiveMapping(device: Device): ChannelMapping {
  return (device.channelMapping as ChannelMapping) ?? DEFAULT_CHANNEL_MAPPING;
}

// updateChannelMapping action 추가
async function updateChannelMapping(deviceId: string, mapping: ChannelMapping) {
  const res = await fetch(`/api/devices/${deviceId}/channel-mapping`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mapping }),
  });
  if (!res.ok) throw new Error('채널 매핑 저장 실패');
  const updated = await res.json();
  // store 내 device 업데이트
  const idx = devices.value.findIndex(d => d.id === deviceId);
  if (idx !== -1) devices.value[idx].channelMapping = updated.channelMapping;
}
```

---

### 4-3. Devices.vue / Groups.vue - 장비 관리 UI 변경

#### 변경 전 (현재)

```vue
<!-- 타이머 전원/B접점 (switch_1) - 조작 가능 -->
<div class="irrigation-row">
  <span class="irrigation-label">타이머 전원/B접점</span>
  <label class="toggle-switch"
    @click.prevent="device.online && irrigationControlling === null && handleIrrigationControl(device, 'switch_1')">
    <input type="checkbox" :checked="device.switchStates?.switch_1 === true" />
  </label>
</div>

<!-- 교반기/B접점 (switch_usb1) - 조작 가능 -->
<div class="irrigation-row">
  <span class="irrigation-label">교반기/B접점</span>
  <label class="toggle-switch"
    @click.prevent="device.online && irrigationControlling === null && handleIrrigationControl(device, 'switch_usb1')">
    <input type="checkbox" :checked="device.switchStates?.switch_usb1 === true" />
  </label>
</div>
```

#### 변경 후

```vue
<script setup>
import { DEFAULT_CHANNEL_MAPPING, FUNCTION_LABELS } from '@/stores/device.store'

// 장비의 유효 매핑 (computed)
const getMapping = (device) =>
  device.channelMapping ?? DEFAULT_CHANNEL_MAPPING
</script>

<!-- 원격제어 ON/OFF (remote_control) - 조작 가능 -->
<div class="irrigation-row">
  <span class="irrigation-label">원격제어 ON/OFF</span>
  <span :class="['status-dot', device.online ? 'online' : 'offline']"></span>
  <div class="irrigation-toggle-area" :class="{ disabled: !device.online }">
    <label class="toggle-switch"
      @click.prevent="device.online && irrigationControlling === null &&
        handleIrrigationControl(device, getMapping(device)['remote_control'])">
      <input type="checkbox"
        :checked="device.switchStates?.[getMapping(device)['remote_control']] === true"
        :disabled="!device.online || irrigationControlling !== null" />
      <span class="toggle-slider"></span>
    </label>
  </div>
</div>

<!-- 액비/교반기 B접점 (fertilizer_b_contact) - 표시만, 조작 불가 -->
<div class="irrigation-row">
  <span class="irrigation-label">액비/교반기 B접점</span>
  <span :class="['status-dot', device.online ? 'online' : 'offline']"></span>
  <div class="irrigation-toggle-area disabled">
    <label class="toggle-switch" style="pointer-events: none; opacity: 0.6">
      <input type="checkbox"
        :checked="device.switchStates?.[getMapping(device)['fertilizer_b_contact']] === true"
        disabled />
      <span class="toggle-slider"></span>
    </label>
  </div>
</div>
```

---

### 4-4. 채널 매핑 설정 패널 (admin / farm_admin 전용)

```vue
<!-- Devices.vue / Groups.vue 관수 카드 하단에 추가 -->

<template v-if="authStore.isAdmin || authStore.isFarmAdmin">
  <div class="channel-mapping-section">
    <button class="btn-mapping-toggle" @click="showMappingPanel = !showMappingPanel">
      채널 설정 {{ showMappingPanel ? '▲' : '▼' }}
    </button>

    <div v-if="showMappingPanel" class="channel-mapping-panel">
      <p class="mapping-desc">각 기능에 연결될 릴레이 채널을 설정합니다.</p>

      <div v-for="(fnKey, idx) in MAPPING_FUNCTION_KEYS" :key="fnKey" class="mapping-row">
        <span class="mapping-label">{{ FUNCTION_LABELS[fnKey] }}</span>
        <select v-model="editMapping[fnKey]" class="mapping-select"
          :class="{ 'duplicate-warning': isDuplicate(editMapping, fnKey) }">
          <option v-for="sw in AVAILABLE_SWITCH_CODES" :key="sw" :value="sw">
            {{ sw }}
          </option>
        </select>
      </div>

      <p v-if="hasDuplicate" class="warning-text">같은 채널이 중복 배정되어 있습니다.</p>

      <div class="mapping-actions">
        <button class="btn-save" :disabled="hasDuplicate || mappingSaving"
          @click="saveMapping(device)">
          {{ mappingSaving ? '저장 중...' : '저장' }}
        </button>
        <button class="btn-reset" @click="resetMapping(device)">기본값 복원</button>
      </div>
    </div>
  </div>
</template>

<script setup>
const MAPPING_FUNCTION_KEYS = [
  'remote_control', 'fertilizer_b_contact',
  'zone_1', 'zone_2', 'zone_3', 'zone_4',
  'mixer', 'fertilizer_motor',
]

// 중복 체크
const isDuplicate = (mapping, targetKey) => {
  const val = mapping[targetKey]
  return Object.entries(mapping).some(([k, v]) => k !== targetKey && v === val)
}
const hasDuplicate = computed(() =>
  MAPPING_FUNCTION_KEYS.some(k => isDuplicate(editMapping.value, k))
)

// 저장
const saveMapping = async (device) => {
  mappingSaving.value = true
  try {
    await deviceStore.updateChannelMapping(device.id, editMapping.value)
  } finally {
    mappingSaving.value = false
    showMappingPanel.value = false
  }
}

// 기본값 복원
const resetMapping = (device) => {
  editMapping.value = { ...DEFAULT_CHANNEL_MAPPING }
}
</script>
```

---

## 5. handleIrrigationControl 변경 (Devices.vue / Groups.vue)

현재 `handleIrrigationControl(device, 'switch_1')` 처럼 switch 코드를 직접 전달한다. 이 패턴 자체는 유지하되, 전달하는 값을 매핑에서 읽도록 변경.

```typescript
// 변경 전
handleIrrigationControl(device, 'switch_1')
handleIrrigationControl(device, 'switch_usb1')

// 변경 후
handleIrrigationControl(device, getMapping(device)['remote_control'])
// switch_usb1 토글 제거 (fertilizer_b_contact는 표시만)
```

**handleIrrigationControl 함수 자체는 변경 없음** - switch 코드를 받아 controlDevice를 호출하는 로직 그대로 유지.

---

## 6. 구현 순서 (Do Phase 체크리스트)

```
[ ] 1. backend/database/schema.sql - channel_mapping 컬럼 추가
[ ] 2. backend/src/modules/devices/channel-mapping.constants.ts - 신규 파일
[ ] 3. backend/src/modules/devices/entities/device.entity.ts - channelMapping 필드
[ ] 4. backend/src/modules/devices/devices.service.ts
        - getEffectiveMapping() 추가
        - updateChannelMapping() 추가
        - controlDevice() 내 원격제어 연동 로직 추가
[ ] 5. backend/src/modules/devices/devices.controller.ts
        - PATCH :id/channel-mapping 엔드포인트
[ ] 6. backend/src/modules/automation/irrigation-scheduler.service.ts
        - ZONE_SWITCH_MAP 제거
        - buildTimeline(conditions, mapping) 파라미터 추가
        - startIrrigation에서 device 매핑 로드
        - 원격제어 OFF 시 스케줄 스킵 체크
        - buildTimeline에서 mixer.enabled 체크 추가
[ ] 7. frontend/src/stores/device.store.ts
        - ChannelMapping 타입 / DEFAULT_CHANNEL_MAPPING / FUNCTION_LABELS 추가
        - Device 인터페이스 channelMapping 필드 추가
        - updateChannelMapping() action 추가
        - GET /devices 응답에서 channelMapping 포함
[ ] 8. frontend/src/views/Devices.vue
        - 토글 UI 변경 (원격제어 / 액비·교반기 B접점)
        - 채널 매핑 설정 패널 추가
[ ] 9. frontend/src/views/Groups.vue
        - Devices.vue와 동일
[ ] 10. frontend/src/types/automation.types.ts
        - IrrigationConditions에서 timerSwitch 필드 제거
[ ] 11. frontend/src/utils/automation-helpers.ts
        - createDefaultIrrigationConditions: timerSwitch 제거, zone 4개로 변경
[ ] 12. frontend/src/components/automation/StepIrrigationCondition.vue
        - channelMapping prop 추가
        - timerSwitch 행 제거
        - zone 4개로 변경 (zone 5 행 제거)
        - 구역 placeholder FUNCTION_LABELS 적용
        - 각 기능 옆 switch 코드 힌트(switch-hint) 표시
        - "교반기/접점" → "교반기"로 라벨 변경
[ ] 13. frontend/src/components/automation/RuleWizardModal.vue
        - selectedDeviceChannelMapping computed 추가
        - StepIrrigationCondition에 :channelMapping 전달
```

---

## 8. 자동화 룰 위저드 - StepIrrigationCondition 채널 매핑 반영 (신규)

> **누락 이유**: 기존 설계에서 `StepConditionBuilder: 변경 없음`으로 처리했으나,
> 관수 장비 선택 시 표시되는 `StepIrrigationCondition`도 채널 매핑을 반영해야 함.

### 8-1. 문제 현황

`RuleWizardModal` Step 4에서 `StepIrrigationCondition`에 전달되는 props:

```vue
<!-- 현재 -->
<StepIrrigationCondition
  v-if="currentStep === 4 && isIrrigation"
  v-model="irrigationForm"
/>
```

- `channelMapping` 정보 미전달 → 구역명이 하드코드 placeholder("1구역")에 의존
- `timerSwitch` 필드 존재 → 불필요 (원격제어는 scheduler가 자동 체크)
- zone 5 포함 → `ZONE_FUNCTION_KEY`에 없어 scheduler에서 무시됨

### 8-2. 변경 후 설계

#### RuleWizardModal.vue 변경

```typescript
// 선택된 장비의 channelMapping 추출
const selectedDeviceChannelMapping = computed(() => {
  if (!formData.value.actuatorDeviceIds.length || !formData.value.groupId) return undefined
  const group = groupStore.groups.find(g => g.id === formData.value.groupId)
  const device = group?.devices?.find((d: any) => d.id === formData.value.actuatorDeviceIds[0])
  return deviceStore.getEffectiveMapping(device as any)
})
```

```vue
<!-- 변경 후 -->
<StepIrrigationCondition
  v-if="currentStep === 4 && isIrrigation"
  v-model="irrigationForm"
  :channelMapping="selectedDeviceChannelMapping"
/>
```

#### StepIrrigationCondition.vue Props 추가

```typescript
import type { ChannelMapping } from '../../types/device.types'
import { DEFAULT_CHANNEL_MAPPING, FUNCTION_LABELS } from '../../types/device.types'

const props = defineProps<{
  modelValue: IrrigationFormData
  channelMapping?: ChannelMapping   // ← 신규
}>()

// 유효 매핑 (없으면 기본값)
const effectiveMapping = computed(() =>
  props.channelMapping ?? DEFAULT_CHANNEL_MAPPING
)
```

#### IrrigationFormData / IrrigationConditions - timerSwitch 제거

```typescript
// frontend/src/types/automation.types.ts
export interface IrrigationConditions {
  type: 'irrigation'
  startTime: string
  // timerSwitch 제거 - 원격제어는 scheduler가 Tuya API로 직접 체크
  zones: IrrigationZoneConfig[]
  mixer: { enabled: boolean }
  fertilizer: { duration: number; preStopWait: number }
  schedule: { days: number[]; repeat: boolean }
}
```

#### createDefaultIrrigationConditions - zone 4개로 변경

```typescript
// frontend/src/utils/automation-helpers.ts
export function createDefaultIrrigationConditions() {
  return {
    type: 'irrigation',
    startTime: '10:00',
    // timerSwitch 제거
    zones: [
      { zone: 1, name: '', duration: 30, waitTime: 5, enabled: true },
      { zone: 2, name: '', duration: 30, waitTime: 5, enabled: true },
      { zone: 3, name: '', duration: 30, waitTime: 5, enabled: true },
      { zone: 4, name: '', duration: 30, waitTime: 5, enabled: true },
    ],
    mixer: { enabled: false },
    fertilizer: { duration: 10, preStopWait: 5 },
    schedule: { days: [1,2,3,4,5,6,0], repeat: true },
  }
}
```

### 8-3. StepIrrigationCondition UI 변경

#### 구역 행 (zone row) - placeholder에 FUNCTION_LABELS 반영

```vue
<!-- 변경 전 -->
<input type="text" v-model="zone.name" :placeholder="`${zone.zone}구역`" />

<!-- 변경 후 -->
<input
  type="text"
  v-model="zone.name"
  :placeholder="FUNCTION_LABELS[`zone_${zone.zone}`] || `${zone.zone}구역`"
/>
<!-- 예: placeholder = "1구역 관수" -->

<!-- switch 코드 힌트 표시 (read-only) -->
<span class="switch-hint">
  {{ effectiveMapping[`zone_${zone.zone}`] || '-' }}
</span>
```

#### 타이머 전원/B접점 행 제거

```vue
<!-- 제거 대상 -->
<div class="setting-row compact">
  <span class="setting-name fixed">타이머 전원/B접점</span>
  ...timerSwitch 토글...
</div>
```

> 원격제어(`switch_1`)는 scheduler가 Tuya API로 상태 확인 후 OFF면 스킵.
> 자동화 조건 폼에서 별도 제어 불필요.

#### 교반기 행 - switch 힌트 추가

```vue
<!-- 교반기 행 -->
<div class="setting-row compact">
  <span class="setting-name fixed">교반기</span>
  <span class="switch-hint">{{ effectiveMapping['mixer'] }}</span>
  <div class="setting-fields">
    <button class="toggle-btn" :class="{ active: form.mixer.enabled }"
      @click="form.mixer.enabled = !form.mixer.enabled">
      {{ form.mixer.enabled ? 'ON' : 'OFF' }}
    </button>
  </div>
</div>
```

#### 액비모터 행 - switch 힌트 추가

```vue
<div class="zone-name-wrap">
  <span class="setting-name fixed">액비모터</span>
  <span class="switch-hint">{{ effectiveMapping['fertilizer_motor'] }}</span>
</div>
```

#### switch-hint 스타일

```css
.switch-hint {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: monospace;
  white-space: nowrap;
}
```

### 8-4. buildTimeline - mixer.enabled 체크 추가

```typescript
// 변경 전: mixer 항상 실행
actions.push({ type: 'mixer_on', switchCode: mapping['mixer'], ... })

// 변경 후: mixer.enabled 시에만 실행
if (conditions.mixer?.enabled && mapping['mixer']) {
  actions.push({ type: 'mixer_on', switchCode: mapping['mixer'], ... })
}
if (conditions.mixer?.enabled && mapping['mixer']) {
  actions.push({ type: 'mixer_off', switchCode: mapping['mixer'], ... })
}
```

---

## 9. 영향 범위 및 주의사항

| 항목 | 내용 |
|------|------|
| 기존 장비 호환 | channelMapping=NULL이면 DEFAULT_CHANNEL_MAPPING 사용. 기존 동작 그대로 |
| 기존 zone 5 | 더 이상 irrigation-scheduler에서 사용 안 함. fertilizer_b_contact(switch_6)는 원격제어 연동으로만 동작 |
| StepIrrigationCondition | **변경 있음** - timerSwitch 제거, zone 4개, channelMapping prop 추가, switch 힌트 표시 |
| StepConditionBuilder | 변경 없음 - relay 조건 로직 유지 (비관수 장비용) |
| automation-runner | buildCommandCandidates의 switch_1은 관수 장비 외 일반 장비에 대한 로직이므로 변경 불필요 |
| farm_user | 채널 매핑 패널 미노출. 토글 동작은 현재와 동일 |
| 기존 자동화 룰 DB 데이터 | timerSwitch 필드가 있는 기존 저장 데이터는 무시됨 (하위호환 무해) |
