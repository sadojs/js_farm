# Irrigation Automation Sync Design Document

> **Summary**: 관수 장비 자동화 상태 표시 + 원격제어 ↔ 자동화룰 양방향 연동 상세 설계
>
> **Feature**: irrigation-automation-sync
> **Plan Reference**: `docs/01-plan/features/irrigation-automation-sync.plan.md`
> **Date**: 2026-04-02
> **Status**: Draft

---

## 1. Architecture Overview

### 1.1 현재 데이터 흐름

```
IrrigationSchedulerService                    Frontend
  activeIrrigations (Map, in-memory)           (조회 불가)
  ↓ 완료 후
  eventsGateway.broadcastAutomationExecuted()  → 'automation:executed' (완료 이벤트만)
```

### 1.2 변경 후 데이터 흐름

```
IrrigationSchedulerService
  activeIrrigations (Map, in-memory)
  ↓ 시작 시
  eventsGateway.emit('irrigation:started')     → Frontend: 실시간 가동 표시
  ↓ 종료 시
  eventsGateway.emit('irrigation:stopped')     → Frontend: 가동 해제
  ↓
  GET /api/automation/irrigation/status        → Frontend: polling fallback + 초기 로드

AutomationService
  toggle() 확장                                → 원격제어 자동 ON (FR-03)
  bulkDisableByDevice() 신규                   → 룰 일괄 비활성화 (FR-04)
  POST /api/automation/rules/bulk-disable      → Frontend: 원격제어 OFF 시 호출
```

---

## 2. Backend Implementation

### 2.1 새 API 엔드포인트

#### GET `/api/automation/irrigation/status`

관수 장비별 자동화 상태를 반환한다.

**Response:**
```typescript
interface IrrigationDeviceStatus {
  deviceId: string          // DB device.id
  deviceName: string
  tuyaDeviceId: string
  // 자동화 룰 정보
  enabledRuleCount: number  // enabled: true인 irrigation 룰 수
  totalRuleCount: number    // 해당 장비의 전체 irrigation 룰 수
  // 가동 상태
  isRunning: boolean
  runningRule?: {
    ruleId: string
    ruleName: string
    startedAt: number       // timestamp ms
    estimatedEndAt: number  // timestamp ms
  }
}

// Response: IrrigationDeviceStatus[]
```

**구현 위치:** `AutomationController` + `AutomationService`

```typescript
// automation.controller.ts
@Get('irrigation/status')
async getIrrigationStatus(@CurrentUser() user) {
  const userId = getEffectiveUserId(user)
  return this.automationService.getIrrigationStatus(userId)
}
```

```typescript
// automation.service.ts
async getIrrigationStatus(userId: string): Promise<IrrigationDeviceStatus[]> {
  // 1. 해당 유저의 모든 irrigation 룰 조회
  const rules = await this.ruleRepo.find({ where: { userId } })
  const irrigationRules = rules.filter(r => r.conditions?.type === 'irrigation')

  // 2. 장비별 그룹핑 (actions.targetDeviceId 또는 targetDeviceIds[0])
  const deviceRuleMap = new Map<string, AutomationRule[]>()
  for (const rule of irrigationRules) {
    const deviceId = rule.actions?.targetDeviceId
      || rule.actions?.targetDeviceIds?.[0]
    if (deviceId) {
      const arr = deviceRuleMap.get(deviceId) || []
      arr.push(rule)
      deviceRuleMap.set(deviceId, arr)
    }
  }

  // 3. 장비 정보 조회 + activeIrrigations 상태 합산
  const result: IrrigationDeviceStatus[] = []
  for (const [deviceId, rules] of deviceRuleMap) {
    const device = await this.devicesService.findOne(deviceId)
    const activeInfo = this.irrigationScheduler.getActiveByDevice(device.tuyaDeviceId)
    result.push({
      deviceId,
      deviceName: device.name,
      tuyaDeviceId: device.tuyaDeviceId,
      enabledRuleCount: rules.filter(r => r.enabled).length,
      totalRuleCount: rules.length,
      isRunning: !!activeInfo,
      runningRule: activeInfo ? {
        ruleId: activeInfo.ruleId,
        ruleName: activeInfo.ruleName,
        startedAt: activeInfo.startedAt,
        estimatedEndAt: activeInfo.estimatedEndAt,
      } : undefined,
    })
  }
  return result
}
```

#### POST `/api/automation/rules/bulk-disable`

특정 장비의 모든 irrigation 룰을 비활성화한다.

**Request:**
```typescript
interface BulkDisableDto {
  deviceId: string  // DB device.id
}
```

**Response:**
```typescript
{
  disabledCount: number     // 비활성화된 룰 수
  stoppedIrrigation: boolean // 진행 중인 관수를 중단했는지
}
```

**구현:**
```typescript
// automation.controller.ts
@Post('rules/bulk-disable')
async bulkDisableByDevice(@CurrentUser() user, @Body() dto: BulkDisableDto) {
  const userId = getEffectiveUserId(user)
  return this.automationService.bulkDisableByDevice(userId, dto.deviceId)
}
```

```typescript
// automation.service.ts
async bulkDisableByDevice(userId: string, deviceId: string) {
  // 1. 해당 장비의 irrigation 룰 찾기
  const rules = await this.ruleRepo.find({ where: { userId } })
  const targetRules = rules.filter(r => {
    if (r.conditions?.type !== 'irrigation') return false
    const ruleDeviceId = r.actions?.targetDeviceId || r.actions?.targetDeviceIds?.[0]
    return ruleDeviceId === deviceId
  })

  // 2. 활성 룰 비활성화
  let disabledCount = 0
  for (const rule of targetRules) {
    if (rule.enabled) {
      rule.enabled = false
      await this.ruleRepo.save(rule)
      disabledCount++
    }
  }

  // 3. 진행 중인 관수 중단
  const device = await this.devicesService.findOne(deviceId)
  const stopped = this.irrigationScheduler.stopByDevice(device.tuyaDeviceId)

  return { disabledCount, stoppedIrrigation: stopped }
}
```

### 2.2 IrrigationSchedulerService 수정

#### activeIrrigations 확장

```typescript
// 기존
interface ActiveIrrigation {
  ruleId: string
  userId: string
  deviceTuyaId: string
  startedAt: number
  timers: ReturnType<typeof setTimeout>[]
}

// 확장
interface ActiveIrrigation {
  ruleId: string
  ruleName: string          // 추가: 프론트엔드 표시용
  userId: string
  deviceTuyaId: string
  startedAt: number
  estimatedEndAt: number    // 추가: 예상 종료 시간
  timers: ReturnType<typeof setTimeout>[]
}
```

#### 새 메서드 추가

```typescript
// 특정 장비의 가동 정보 조회
getActiveByDevice(tuyaDeviceId: string): ActiveIrrigation | undefined {
  for (const [, active] of this.activeIrrigations) {
    if (active.deviceTuyaId === tuyaDeviceId) return active
  }
  return undefined
}

// 특정 장비의 가동 중단
stopByDevice(tuyaDeviceId: string): boolean {
  for (const [ruleId, active] of this.activeIrrigations) {
    if (active.deviceTuyaId === tuyaDeviceId) {
      // 모든 예약 타이머 취소
      active.timers.forEach(t => clearTimeout(t))
      this.activeIrrigations.delete(ruleId)
      // 종료 이벤트 emit
      this.eventsGateway.emitIrrigationStopped({
        ruleId, deviceTuyaId: tuyaDeviceId
      })
      return true
    }
  }
  return false
}
```

#### startIrrigation 수정 — 이벤트 emit 추가

```typescript
// startIrrigation() 메서드 내부, 타이머 등록 직후에 추가:

// activeIrrigations 등록 시 추가 필드
this.activeIrrigations.set(rule.id, {
  ruleId: rule.id,
  ruleName: rule.name,           // 추가
  userId: rule.userId,
  deviceTuyaId: tuyaDeviceId,
  startedAt: Date.now(),
  estimatedEndAt: Date.now() + totalDurationMs,  // 추가
  timers,
})

// 시작 이벤트 emit
this.eventsGateway.emitIrrigationStarted({
  ruleId: rule.id,
  ruleName: rule.name,
  deviceId,          // DB device.id
  tuyaDeviceId,
  startedAt: Date.now(),
  estimatedEndAt: Date.now() + totalDurationMs,
})
```

#### cleanup 타이머 수정 — 종료 이벤트 emit

```typescript
// 기존 cleanup 로직에서 activeIrrigations.delete() 직전에 추가:
this.eventsGateway.emitIrrigationStopped({
  ruleId: rule.id,
  deviceTuyaId: tuyaDeviceId,
})
```

### 2.3 EventsGateway 수정

```typescript
// events.gateway.ts에 추가

emitIrrigationStarted(data: {
  ruleId: string
  ruleName: string
  deviceId: string
  tuyaDeviceId: string
  startedAt: number
  estimatedEndAt: number
}) {
  this.server.emit('irrigation:started', data)
}

emitIrrigationStopped(data: {
  ruleId: string
  deviceTuyaId: string
}) {
  this.server.emit('irrigation:stopped', data)
}
```

### 2.4 AutomationService.toggle() 수정 (FR-03 지원)

```typescript
// 기존 toggle에 옵션 추가
async toggle(id: string, userId: string, options?: { autoEnableRemote?: boolean }) {
  const rule = await this.ruleRepo.findOneOrFail({ where: { id, userId } })
  rule.enabled = !rule.enabled
  await this.ruleRepo.save(rule)

  // FR-03: 활성화 시 원격제어 자동 ON
  if (rule.enabled && options?.autoEnableRemote && rule.conditions?.type === 'irrigation') {
    const deviceId = rule.actions?.targetDeviceId || rule.actions?.targetDeviceIds?.[0]
    if (deviceId) {
      await this.ensureRemoteControlOn(userId, deviceId)
    }
  }

  return rule
}

private async ensureRemoteControlOn(userId: string, deviceId: string): Promise<boolean> {
  const device = await this.devicesService.findOne(deviceId)
  const mapping = this.devicesService.getEffectiveMapping(device)
  const remoteCode = mapping['remote_control']
  if (!remoteCode) return false

  // 현재 스위치 상태 확인
  const status = await this.tuyaService.getDeviceStatus(/*creds*/, device.tuyaDeviceId)
  const isOn = status.result?.find(s => s.code === remoteCode)?.value === true
  if (isOn) return false // 이미 ON

  // 원격제어 ON 명령 전송
  await this.devicesService.controlDevice(deviceId, [{ code: remoteCode, value: true }])
  return true // 자동 활성화됨
}
```

### 2.5 AutomationController.toggle() 수정

```typescript
// 기존
@Patch('rules/:id/toggle')
async toggle(@Param('id') id: string, @CurrentUser() user) {
  const userId = getEffectiveUserId(user)
  return this.automationService.toggle(id, userId)
}

// 변경: query param으로 autoEnableRemote 전달
@Patch('rules/:id/toggle')
async toggle(
  @Param('id') id: string,
  @CurrentUser() user,
  @Query('autoEnableRemote') autoEnableRemote?: string
) {
  const userId = getEffectiveUserId(user)
  return this.automationService.toggle(id, userId, {
    autoEnableRemote: autoEnableRemote === 'true'
  })
}
```

---

## 3. Frontend Implementation

### 3.1 API 추가 (`automation.api.ts`)

```typescript
// 기존 automationApi에 추가
getIrrigationStatus: () =>
  client.get<IrrigationDeviceStatus[]>('/automation/irrigation/status'),

bulkDisableByDevice: (deviceId: string) =>
  client.post<{ disabledCount: number; stoppedIrrigation: boolean }>(
    '/automation/rules/bulk-disable', { deviceId }
  ),
```

### 3.2 Store 추가 (`automation.store.ts`)

```typescript
// 상태 추가
const irrigationStatus = ref<IrrigationDeviceStatus[]>([])

// 메서드 추가
async function fetchIrrigationStatus() {
  const { data } = await automationApi.getIrrigationStatus()
  irrigationStatus.value = data
}

async function bulkDisableByDevice(deviceId: string) {
  const { data } = await automationApi.bulkDisableByDevice(deviceId)
  // 로컬 상태에서도 해당 룰들 비활성화 반영
  rules.value.forEach(rule => {
    if (rule.conditions?.type === 'irrigation') {
      const ruleDeviceId = rule.actions?.targetDeviceId || rule.actions?.targetDeviceIds?.[0]
      if (ruleDeviceId === deviceId) {
        rule.enabled = false
      }
    }
  })
  return data
}

// 장비별 가동 상태 조회 헬퍼
function getDeviceIrrigationStatus(deviceId: string) {
  return irrigationStatus.value.find(s => s.deviceId === deviceId)
}
```

### 3.3 WebSocket 이벤트 수신 (`useWebSocket` composable)

```typescript
// 기존 WebSocket 연결에 이벤트 리스너 추가
socket.on('irrigation:started', (data) => {
  const automationStore = useAutomationStore()
  // irrigationStatus 업데이트
  const status = automationStore.irrigationStatus.find(
    s => s.tuyaDeviceId === data.tuyaDeviceId
  )
  if (status) {
    status.isRunning = true
    status.runningRule = {
      ruleId: data.ruleId,
      ruleName: data.ruleName,
      startedAt: data.startedAt,
      estimatedEndAt: data.estimatedEndAt,
    }
  }
})

socket.on('irrigation:stopped', (data) => {
  const automationStore = useAutomationStore()
  const status = automationStore.irrigationStatus.find(
    s => s.tuyaDeviceId === data.deviceTuyaId
  )
  if (status) {
    status.isRunning = false
    status.runningRule = undefined
  }
})
```

### 3.4 FR-01: IrrigationStatusModal.vue 수정

**현재 구조:**
```
스위치 목록 (mappingKeys loop)
  └ 기능명 + ON/OFF 상태
```

**변경 후 구조:**
```
스위치 목록 (mappingKeys loop)
  └ 기능명 + ON/OFF 상태 + [자동화 가동중 배지] (스위치 ON이고 가동중일 때)
자동화 요약 섹션 (하단)
  └ "자동화: 활성 (N개 룰)" 또는 "자동화: 비활성"
  └ 가동중이면: "현재: {룰이름} 가동중 (N분 남음)"
```

**구현:**
```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAutomationStore } from '../../stores/automation.store'

const automationStore = useAutomationStore()

// 장비의 자동화 상태
const deviceStatus = computed(() =>
  props.device ? automationStore.getDeviceIrrigationStatus(props.device.id) : null
)

// 남은 시간 계산
const remainingMinutes = computed(() => {
  if (!deviceStatus.value?.runningRule) return 0
  const remaining = deviceStatus.value.runningRule.estimatedEndAt - Date.now()
  return Math.max(0, Math.ceil(remaining / 60000))
})

onMounted(() => {
  automationStore.fetchIrrigationStatus()
})
</script>
```

**템플릿 변경:**
- 각 스위치 행에 `v-if="isRunningSwitch(key)"` 조건으로 "가동중" 배지 추가
- 하단에 자동화 요약 섹션 추가

### 3.5 FR-02: IrrigationHistoryWidget.vue 수정

**현재 구조:**
```
통계 (성공률, 오늘 실행, 최다 룰)
최근 로그 (5건)
```

**변경 후 구조:**
```
실시간 상태 (장비별)           ← 새 섹션
  └ 장비명 + 자동화 활성여부 + 가동상태
통계 (성공률, 오늘 실행, 최다 룰)
최근 로그 (5건)
```

**구현:**
```vue
<script setup>
const automationStore = useAutomationStore()

onMounted(() => {
  automationStore.fetchIrrigationStatus()
})

const irrigationDevices = computed(() => automationStore.irrigationStatus)
</script>

<template>
  <!-- 실시간 상태 섹션 -->
  <div v-if="irrigationDevices.length" class="realtime-section">
    <div v-for="device in irrigationDevices" :key="device.deviceId" class="device-status-row">
      <span class="device-name">{{ device.deviceName }}</span>
      <div class="status-badges">
        <span v-if="device.enabledRuleCount > 0" class="badge badge-active">
          자동화 활성 ({{ device.enabledRuleCount }})
        </span>
        <span v-else class="badge badge-inactive">자동화 비활성</span>

        <span v-if="device.isRunning" class="badge badge-running">
          가동중 — {{ device.runningRule?.ruleName }}
        </span>
        <span v-else class="badge badge-idle">대기</span>
      </div>
    </div>
  </div>
  <!-- 기존 통계 + 로그 유지 -->
</template>
```

### 3.6 FR-03: Automation.vue — 룰 활성화 시 원격제어 자동 ON

**현재 `handleToggle()`:**
```typescript
async function handleToggle(rule: AutomationRule) {
  rule.enabled = !rule.enabled  // optimistic
  await automationStore.toggleRule(rule.id)
}
```

**변경 후:**
```typescript
async function handleToggle(rule: AutomationRule) {
  const willEnable = !rule.enabled
  rule.enabled = willEnable  // optimistic

  if (willEnable && isIrrigationRule(rule)) {
    // FR-03: autoEnableRemote=true 전달
    await automationStore.toggleRule(rule.id, { autoEnableRemote: true })
    // 토스트 알림은 백엔드 응답에서 remoteControlEnabled 확인 후 표시
    // (또는 항상 "룰이 활성화되었습니다. 원격제어도 확인하세요" 표시)
    notificationStore.success('자동화 룰이 활성화되었습니다')
  } else {
    await automationStore.toggleRule(rule.id)
  }
}

function isIrrigationRule(rule: AutomationRule): boolean {
  return rule.conditions?.type === 'irrigation'
}
```

**Store 변경:**
```typescript
async function toggleRule(id: string, options?: { autoEnableRemote?: boolean }) {
  const params = options?.autoEnableRemote ? '?autoEnableRemote=true' : ''
  await automationApi.toggleRule(id, params)
  const rule = rules.value.find(r => r.id === id)
  if (rule) rule.enabled = !rule.enabled
}
```

**API 변경:**
```typescript
toggleRule: (id: string, params?: string) =>
  client.patch(`/automation/rules/${id}/toggle${params || ''}`),
```

### 3.7 FR-04: Devices.vue / Groups.vue — 원격제어 OFF 시 룰 비활성화

**현재 `handleIrrigationControl()`:** (Devices.vue)
```typescript
async function handleIrrigationControl(device, switchCode) {
  const currentVal = device.switchStates?.[switchCode] ?? false
  const newVal = !currentVal
  await deviceStore.controlDevice(device.id, [{ code: switchCode, value: newVal }])
  device.switchStates[switchCode] = newVal
}
```

**변경 후:**
```typescript
async function handleIrrigationControl(device, switchCode) {
  const mapping = deviceStore.getEffectiveMapping(device)
  const isRemoteControl = mapping['remote_control'] === switchCode
  const currentVal = device.switchStates?.[switchCode] ?? false
  const newVal = !currentVal

  // FR-04: 원격제어 OFF 시 확인 다이얼로그
  if (isRemoteControl && !newVal) {
    const deviceStatus = automationStore.getDeviceIrrigationStatus(device.id)
    const enabledCount = deviceStatus?.enabledRuleCount || 0

    if (enabledCount > 0) {
      const confirmed = await confirmStore.show({
        title: '원격제어 끄기',
        message: `원격제어를 끄면 이 장비의 자동화 룰 ${enabledCount}개도 비활성화됩니다.${
          deviceStatus?.isRunning ? '\n현재 가동 중인 관수도 중단됩니다.' : ''
        }`,
        confirmText: '끄기',
        cancelText: '취소',
        type: 'warning',
      })
      if (!confirmed) return
    }
  }

  // 스위치 제어
  await deviceStore.controlDevice(device.id, [{ code: switchCode, value: newVal }])
  device.switchStates[switchCode] = newVal

  // FR-04: 원격제어 OFF 후 룰 일괄 비활성화
  if (isRemoteControl && !newVal) {
    const result = await automationStore.bulkDisableByDevice(device.id)
    if (result.disabledCount > 0) {
      notificationStore.info(
        `자동화 룰 ${result.disabledCount}개가 비활성화되었습니다`
      )
    }
  }
}
```

**Groups.vue에도 동일 로직 적용** (관수 장비 원격제어 토글 핸들러)

---

## 4. Affected Files Summary

### 4.1 Backend (4개)

| 파일 | 변경 내용 |
|------|----------|
| `irrigation-scheduler.service.ts` | ActiveIrrigation 확장, getActiveByDevice/stopByDevice 추가, 이벤트 emit |
| `automation.controller.ts` | GET irrigation/status, POST rules/bulk-disable, toggle query param |
| `automation.service.ts` | getIrrigationStatus(), bulkDisableByDevice(), toggle options, ensureRemoteControlOn() |
| `events.gateway.ts` | emitIrrigationStarted(), emitIrrigationStopped() |

### 4.2 Frontend (7개)

| 파일 | 변경 내용 |
|------|----------|
| `automation.api.ts` | getIrrigationStatus, bulkDisableByDevice, toggleRule params |
| `automation.store.ts` | irrigationStatus 상태, fetchIrrigationStatus, bulkDisableByDevice, getDeviceIrrigationStatus |
| `IrrigationStatusModal.vue` | 자동화 가동 상태 배지 + 요약 섹션 (FR-01) |
| `IrrigationHistoryWidget.vue` | 실시간 상태 섹션 추가 (FR-02) |
| `Automation.vue` | handleToggle에 autoEnableRemote 로직 (FR-03) |
| `Devices.vue` | handleIrrigationControl에 확인 다이얼로그 + bulkDisable (FR-04) |
| `Groups.vue` | 동일 FR-04 로직 |

### 4.3 변경하지 않는 파일

| 파일 | 이유 |
|------|------|
| `automation-runner.service.ts` | 비관수 자동화만 처리, 이번 스코프 밖 |
| 채널 매핑 관련 | 이미 완료 (irrigation-relay-mapping) |
| 자동화 룰 생성/수정 UI | 스코프 밖 |

---

## 5. Implementation Order & Dependencies

```
Phase 1 (Backend)
  ├── ActiveIrrigation 구조체 확장 (ruleName, estimatedEndAt)
  ├── getActiveByDevice(), stopByDevice() 메서드 추가
  ├── startIrrigation()에 이벤트 emit 추가
  ├── EventsGateway에 irrigation:started/stopped 추가
  ├── GET /api/automation/irrigation/status 엔드포인트
  ├── POST /api/automation/rules/bulk-disable 엔드포인트
  └── toggle() options 확장 + ensureRemoteControlOn()
       ↓
Phase 2 (Frontend API + Store)
  ├── automation.api.ts 신규 함수
  ├── automation.store.ts 상태 + 메서드
  └── useWebSocket irrigation 이벤트 수신
       ↓
Phase 3 (Frontend UI - FR-01, FR-02)
  ├── IrrigationStatusModal.vue 자동화 상태 표시
  └── IrrigationHistoryWidget.vue 실시간 상태 섹션
       ↓
Phase 4 (Frontend UI - FR-03, FR-04)
  ├── Automation.vue handleToggle 연동
  ├── Devices.vue handleIrrigationControl 연동
  └── Groups.vue handleIrrigationControl 연동
```

---

## 6. Edge Cases

| 시나리오 | 동작 |
|----------|------|
| 서버 재시작 후 activeIrrigations 유실 | API 조회 시 isRunning: false 반환 (정상) |
| 룰 활성화 시 장비 오프라인 | 원격제어 ON 명령 실패 → 토스트 오류 표시, 룰은 활성 상태 유지 |
| 원격제어 OFF 중 WebSocket 끊김 | 다음 페이지 진입 시 fetchIrrigationStatus()로 동기화 |
| 관수 가동 중 원격제어 OFF | 확인 다이얼로그 표시 → 승인 시 stopByDevice() + bulkDisable |
| 동일 장비에 활성 룰 0개인데 원격제어 OFF | 확인 다이얼로그 없이 바로 OFF (enabledCount === 0) |
| 원격제어 이미 ON인 상태에서 룰 활성화 | ensureRemoteControlOn()에서 이미 ON 확인 → 추가 동작 없음 |

---

## 7. Success Criteria

| 항목 | 기준 |
|------|------|
| 상태 모달 자동화 정보 | 가동중/대기/활성룰수 정확히 표시 |
| 대시보드 실시간 상태 | 장비별 활성/가동 상태 표시 |
| 룰 활성화 → 원격제어 ON | 토스트 알림 + 원격제어 자동 전환 |
| 원격제어 OFF → 룰 비활성화 | 확인 다이얼로그 + 일괄 비활성화 + 토스트 |
| WebSocket 실시간 반영 | started/stopped 이벤트 10초 이내 |
| Gap Analysis Match Rate | >= 90% |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-02 | Initial design | AI Assistant |
