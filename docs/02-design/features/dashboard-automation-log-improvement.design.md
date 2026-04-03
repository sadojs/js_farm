# dashboard-automation-log-improvement Design

> 대시보드 관수 현황 위젯 개선 + 자동화 실행 로그 버그 수정

## 1. 변경 방향 요약

| 위치 | 역할 | 변경 |
|------|------|------|
| **대시보드** IrrigationHistoryWidget | 관수 전용 현황 | 그룹별 묶기 + 룰 요약 + 관수 로그만 표시 |
| **자동화 페이지** AutomationLogTimeline | 전체 자동화 실행 로그 | ruleName 정상 표시 (백엔드 JOIN) |
| **백엔드** automation.service.ts | 로그 API | getLogs()에 ruleName JOIN |
| **백엔드** irrigation-scheduler.service.ts | 관수 로그 | 시작 시점 로그 추가 |

## 2. 백엔드 변경

### 2.1 FR-04: getLogs() — ruleName LEFT JOIN

**파일**: `backend/src/modules/automation/automation.service.ts`

현재 `getLogs()`는 `automation_logs` 테이블만 조회하여 `ruleName`이 없음.

**변경**:
```typescript
async getLogs(userId: string, params: { ruleId?: string; page?: number; limit?: number }) {
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(100, Math.max(1, Number(params.limit || 20)));

  const qb = this.logsRepo
    .createQueryBuilder('l')
    .leftJoin('automation_rules', 'r', 'r.id = l.rule_id')
    .addSelect('r.name', 'ruleName')
    .where('l.user_id = :userId', { userId })
    .orderBy('l.executed_at', 'DESC')
    .skip((page - 1) * limit)
    .take(limit);

  if (params.ruleId) {
    qb.andWhere('l.rule_id = :ruleId', { ruleId: params.ruleId });
  }

  const items = await qb.getRawAndEntities();
  // raw에서 ruleName을 entity에 매핑
  const data = items.entities.map((entity, i) => ({
    ...entity,
    ruleName: items.raw[i]?.ruleName || null,
  }));

  return { data, total: data.length };
}
```

**핵심**: `getRawAndEntities()` 사용으로 entity 필드 + `r.name` alias를 동시에 반환.

### 2.2 FR-05: 관수 시작 로그 기록

**파일**: `backend/src/modules/automation/irrigation-scheduler.service.ts`

현재는 `cleanupTimer`(관수 완료) 시점에만 로그 기록. **시작 시점에도 1건 추가**.

**위치**: `startIrrigation()` 메서드에서 타이머 등록 직후, `emitIrrigationStarted` 이벤트 근처.

```typescript
// 기존: emitIrrigationStarted 이후에 추가
await this.logsRepo.save(
  this.logsRepo.create({
    ruleId: rule.id,
    userId: rule.userId,
    success: true,
    conditionsMet: {
      type: 'irrigation_started',
      startTime: conditions.startTime,
      enabledZones: conditions.zones.filter(z => z.enabled).length,
      totalZones: conditions.zones.length,
    },
    actionsExecuted: { status: 'started', estimatedDurationMin: Math.round(totalDurationMs / 60000) },
  }),
);
```

기존 완료 로그의 `conditionsMet.type`은 `'irrigation'` → 시작은 `'irrigation_started'`로 구분.

### 2.3 irrigationStatus API — groupId/groupName 추가

**파일**: `backend/src/modules/automation/automation.service.ts` → `getIrrigationStatus()`

현재 응답에 `groupId`/`groupName`이 없어 프론트에서 그룹별 묶기 불가.

**변경**: device 조회 시 group 정보도 함께 반환.

```typescript
// 기존 device 조회 후 추가
const device = await this.devicesRepo.findOne({
  where: { id: deviceId },
  relations: ['group'],  // group relation 로드
});
// ...
result.push({
  deviceId,
  deviceName: device.name,
  groupId: device.group?.id || null,
  groupName: device.group?.name || null,
  // ... 기존 필드 유지
});
```

### 2.4 irrigationStatus API — 룰 요약 정보 추가

각 장비에 연결된 **활성 룰의 요약** 정보를 포함.

```typescript
// 기존 result.push에 추가
ruleSummaries: devRules.filter(r => r.enabled).map(r => {
  const cond = r.conditions as any;
  return {
    ruleId: r.id,
    ruleName: r.name,
    startTime: cond?.startTime || null,
    enabledZones: cond?.zones?.filter((z: any) => z.enabled).length || 0,
    totalZones: cond?.zones?.length || 0,
    days: cond?.schedule?.days || [],
    repeat: cond?.schedule?.repeat ?? true,
  };
}),
```

## 3. 프론트엔드 변경

### 3.1 FR-04: automation-log.api.ts 타입 정리

**파일**: `frontend/src/api/automation-log.api.ts`

`ruleName`이 이제 백엔드에서 항상 반환되므로:
```typescript
export interface AutomationLogEntry {
  // ...
  ruleName: string | null  // optional → nullable
}
```

### 3.2 FR-01 + FR-02: IrrigationHistoryWidget 리팩토링

**파일**: `frontend/src/components/dashboard/IrrigationHistoryWidget.vue`

#### 3.2.1 그룹별 묶기

```typescript
const groupedDevices = computed(() => {
  const groups = new Map<string, { groupName: string; devices: IrrigationDeviceStatus[] }>()
  for (const device of irrigationDevices.value) {
    const key = device.groupId || 'ungrouped'
    if (!groups.has(key)) {
      groups.set(key, { groupName: device.groupName || '미분류', devices: [] })
    }
    groups.get(key)!.devices.push(device)
  }
  return Array.from(groups.values())
})
```

#### 3.2.2 템플릿 구조

```html
<!-- 그룹별 관수 현황 -->
<div v-for="group in groupedDevices" :key="group.groupName" class="group-section">
  <div class="group-header">{{ group.groupName }}</div>
  <div v-for="device in group.devices" :key="device.deviceId" class="device-status-row">
    <div class="device-info">
      <span class="device-name">{{ device.deviceName }}</span>
      <!-- 룰 요약 -->
      <div v-if="device.ruleSummaries?.length" class="rule-summaries">
        <span v-for="rs in device.ruleSummaries" :key="rs.ruleId" class="rule-chip">
          {{ rs.startTime }} · {{ rs.enabledZones }}/{{ rs.totalZones }}구역 · {{ formatDays(rs.days) }}
        </span>
      </div>
    </div>
    <div class="status-badges">
      <!-- 기존 배지 유지 -->
    </div>
  </div>
</div>
```

#### 3.2.3 요일 포맷 헬퍼

```typescript
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
function formatDays(days: number[]): string {
  if (!days?.length) return ''
  return days.sort((a, b) => a - b).map(d => DAY_LABELS[d]).join('')
}
```

#### 3.2.4 대시보드 위젯 하단 로그 — 관수만

현재 `automationLogApi.getLogs({ limit: 5 })` → 모든 자동화 로그 반환.

**방안**: 프론트에서 관수 로그만 필터 (conditionsMet.type이 'irrigation' 또는 'irrigation_started').

```typescript
// getLogs 후 관수 관련만 필터
recentLogs.value = allLogs.filter(l =>
  l.conditionsMet?.type === 'irrigation' ||
  l.conditionsMet?.type === 'irrigation_started'
).slice(0, 5)
```

### 3.3 FR-03: AutomationLogTimeline — ruleName 정상 표시

백엔드 FR-04 수정으로 `log.ruleName`이 정상 반환되면, 프론트에서는 추가 변경 없이 기존 코드가 작동:
- `AutomationLogTimeline.vue:44` → `log.ruleName || '알 수 없는 룰'`
- `IrrigationHistoryWidget.vue:47` → `log.ruleName || '규칙'`

`ruleName`이 null인 경우(삭제된 룰)만 fallback 표시.

### 3.4 automation.api.ts 타입 확장

```typescript
export interface IrrigationDeviceStatus {
  deviceId: string
  deviceName: string
  groupId: string | null      // 추가
  groupName: string | null     // 추가
  tuyaDeviceId: string
  enabledRuleCount: number
  totalRuleCount: number
  isRunning: boolean
  runningRule?: { ... }
  ruleSummaries: {             // 추가
    ruleId: string
    ruleName: string
    startTime: string | null
    enabledZones: number
    totalZones: number
    days: number[]
    repeat: boolean
  }[]
}
```

## 4. 구현 순서

| 순서 | FR | 작업 | 파일 |
|:----:|:--:|------|------|
| 1 | FR-04 | getLogs() ruleName LEFT JOIN | `automation.service.ts` |
| 2 | FR-05 | 관수 시작 로그 추가 | `irrigation-scheduler.service.ts` |
| 3 | FR-01 | irrigationStatus에 groupId/groupName/ruleSummaries 추가 | `automation.service.ts` |
| 4 | FR-01+02 | IrrigationHistoryWidget 그룹별 UI + 룰 요약 | `IrrigationHistoryWidget.vue` |
| 5 | FR-03 | 대시보드 로그는 관수만, 자동화 페이지는 전체 | `IrrigationHistoryWidget.vue` |
| 6 | - | 양 프로젝트 동기화 | smart-farm-mqtt 동일 반영 |

## 5. 양 프로젝트 차이점

| 항목 | smart-farm-platform | smart-farm-mqtt |
|------|:-------------------:|:---------------:|
| 장비 식별 | tuyaDeviceId | zigbeeIeee |
| 장비 조회 | devicesRepo.findOne | devicesRepo.findOne |
| group relation | device.group | device.group |
| 로그 저장 | 동일 | 동일 |

백엔드 로직은 거의 동일하며, 장비 식별자 필드명만 다름.
