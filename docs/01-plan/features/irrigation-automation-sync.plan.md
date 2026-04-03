# Irrigation Automation Sync Planning Document

> **Summary**: 관수 장비의 자동화 상태 표시 강화 + 원격제어 ↔ 자동화룰 양방향 연동
>
> **Project**: Smart Farm Platform
> **Author**: AI Assistant
> **Date**: 2026-04-02
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

관수 장비의 운영 가시성을 높이고, 원격제어(remote_control)와 자동화 룰 간의 상태 불일치를 방지한다.

### 1.2 Background

**현재 상태:**

| 영역 | 현재 | 문제점 |
|------|------|--------|
| 상태 모달 | 스위치 ON/OFF만 표시 | 자동화로 가동 중인지, 수동인지 구분 불가 |
| 대시보드 | 과거 실행 로그만 표시 | 실시간 자동화 활성/가동 상태 없음 |
| 원격제어 ↔ 룰 | 독립적으로 동작 | 원격제어 OFF인데 룰은 활성 상태로 남아있어 혼란 |

**현재 아키텍처:**
- `IrrigationSchedulerService`가 매분 cron으로 실행
- `activeIrrigations` Map (인메모리)에 현재 가동 중인 관수 추적
- 원격제어(switch_1) OFF면 스케줄러가 해당 룰 건너뜀 (무시만 할 뿐, 룰을 비활성화하지 않음)
- 프론트엔드에 가동 중 여부를 알려주는 채널 없음

### 1.3 Related Documents

- CLAUDE.md: 자동화 규칙 UI, 개폐기 인터록 규칙
- `docs/02-design/features/irrigation-relay-mapping.design.md`

---

## 2. Scope

### 2.1 In Scope

- [ ] FR-01: 관수 상태 모달에 자동화 스케줄 상태 정보 추가
- [ ] FR-02: 대시보드에 관수 자동화 실시간 상태 위젯 추가
- [ ] FR-03: 자동화 룰 활성화 → 원격제어 자동 ON
- [ ] FR-04: 원격제어 OFF → 해당 장비 모든 자동화 룰 비활성화

### 2.2 Out of Scope

- 관수 채널 매핑 변경 (이미 완료)
- 자동화 룰 생성/수정 UI 변경
- 비관수 장비(팬, 개폐기) 자동화 연동

---

## 3. Requirements

### 3.1 FR-01: 관수 상태 모달 — 자동화 상태 정보 추가

**현재:** 스위치별 ON/OFF 상태만 표시

**변경 후:** 각 스위치 상태 옆에 자동화 실행 정보 추가 표시

```
┌─────────────────────────────────────────┐
│ 💧 관수-1호기        스위치 상태         │
├─────────────────────────────────────────┤
│ 원격제어 ON/OFF    ● ON                 │
│ 액비/교반기 B접점   ○ OFF                │
│ 1구역 관수         ● ON   ⏱ 가동중      │
│ 2구역 관수         ○ OFF                │
│ 3구역 관수         ○ OFF   📅 09:00 예정 │
│ 4구역 관수         ○ OFF                │
│ 교반기             ● ON   ⏱ 가동중      │
│ 액비모터           ○ OFF                │
├─────────────────────────────────────────┤
│ 🤖 자동화: 활성 (2개 룰)               │
│ ⏱ 현재: "오전 관수" 가동중 (3분 남음)   │
└─────────────────────────────────────────┘
```

**구현 방식:**
- 백엔드 `activeIrrigations` 정보를 API/WebSocket으로 프론트엔드에 전달
- 자동화 룰 목록에서 해당 장비에 연결된 활성 룰 수 표시
- 현재 가동 중인 경우: 룰 이름 + 남은 시간 표시

### 3.2 FR-02: 대시보드 관수 자동화 실시간 상태

**현재:** `IrrigationHistoryWidget`에 과거 실행 로그(성공/실패 5건)만 표시

**변경 후:** 기존 위젯 상단에 실시간 상태 섹션 추가

```
┌─────────────────────────────────────────┐
│ 💧 관수 현황                            │
├─────────────────────────────────────────┤
│ 관수-1호기                              │
│   🤖 자동화: 활성 (2개 룰)              │
│   ⏱ 상태: 가동중 — "오전 관수"          │
│                                         │
│ 관수-2호기                              │
│   🤖 자동화: 비활성                     │
│   💤 상태: 대기                         │
├─────────────────────────────────────────┤
│ 최근 실행 이력                          │
│   ✅ 오전 관수 — 3분 전                 │
│   ✅ 오후 관수 — 5시간 전               │
└─────────────────────────────────────────┘
```

**표시 정보 (장비당):**

| 항목 | 데이터 소스 | 표시 |
|------|-----------|------|
| 자동화 활성 여부 | 해당 장비에 `enabled: true`인 룰 존재 여부 | "활성 (N개 룰)" / "비활성" |
| 가동 상태 | 백엔드 `activeIrrigations` Map | "가동중 — {룰이름}" / "대기" |

### 3.3 FR-03: 자동화 룰 활성화 → 원격제어 자동 ON

**시나리오:** Automation.vue에서 관수 장비 룰을 활성화(toggle ON)할 때

**현재 동작:**
1. `automationStore.toggleRule(id)` → `rule.enabled = true`
2. 스케줄러가 다음 분에 체크 → remote_control OFF면 그냥 건너뜀
3. 사용자는 "활성화했는데 왜 안 돌아가지?" 혼란

**변경 후 동작:**
1. `automationStore.toggleRule(id)` → `rule.enabled = true`
2. **해당 장비의 remote_control 스위치 상태 확인**
3. **OFF면 자동으로 ON 전환** (Tuya API 호출)
4. 사용자에게 토스트 알림: "원격제어가 자동으로 활성화되었습니다"

**조건:**
- 동일 장비에 여러 룰이 있을 때, 하나라도 활성화하면 원격제어 ON
- 이미 ON이면 추가 동작 없음

### 3.4 FR-04: 원격제어 OFF → 자동화 룰 전체 비활성화

**시나리오:** Devices.vue 또는 Groups.vue에서 관수 장비의 원격제어를 OFF할 때

**현재 동작:**
1. `handleIrrigationControl(device, switchCode)` → switch_1 OFF
2. 스케줄러가 다음 분에 체크 → remote_control OFF 확인 → 건너뜀
3. 룰은 `enabled: true` 상태로 남아있어 Automation.vue에서 "활성" 표시

**변경 후 동작:**
1. `handleIrrigationControl(device, switchCode)` → switch_1 OFF
2. **해당 장비의 모든 자동화 룰을 비활성화** (API 호출)
3. 사용자에게 토스트 알림: "관수-1호기의 자동화 룰 N개가 비활성화되었습니다"
4. Automation.vue에서도 해당 룰들이 "비활성" 표시로 변경

**조건:**
- 해당 장비(deviceId 기준)에 연결된 모든 irrigation 룰을 대상으로 함
- 현재 가동 중인 관수가 있으면 중단 후 비활성화
- 확인 다이얼로그 표시: "원격제어를 끄면 자동화 룰 N개도 비활성화됩니다"

---

## 4. 필요한 백엔드 변경

### 4.1 새 API 엔드포인트

| Method | Path | 용도 |
|--------|------|------|
| GET | `/api/automation/irrigation/active` | 현재 가동 중인 관수 목록 조회 |
| POST | `/api/automation/rules/bulk-disable` | 특정 장비의 룰 일괄 비활성화 |

### 4.2 WebSocket 이벤트 (선택)

| Event | Payload | 용도 |
|-------|---------|------|
| `irrigation:started` | `{ ruleId, deviceId, ruleName, estimatedEnd }` | 관수 시작 알림 |
| `irrigation:stopped` | `{ ruleId, deviceId }` | 관수 종료 알림 |

### 4.3 기존 서비스 수정

- `IrrigationSchedulerService`: 가동 시작/종료 시 WebSocket 이벤트 emit
- `AutomationController`: bulk-disable 엔드포인트 추가
- `AutomationService`: 장비 ID 기준 룰 일괄 비활성화 메서드

---

## 5. 영향 범위

### 5.1 수정 대상 파일

**Backend (4~5개)**
- `backend/src/modules/automation/irrigation-scheduler.service.ts` — 가동 상태 이벤트 emit
- `backend/src/modules/automation/automation.controller.ts` — 새 API 추가
- `backend/src/modules/automation/automation.service.ts` — bulk-disable 로직
- `backend/src/modules/gateway/events.gateway.ts` — WebSocket 이벤트 정의

**Frontend (6~7개)**
- `frontend/src/components/devices/IrrigationStatusModal.vue` — 자동화 상태 표시
- `frontend/src/components/dashboard/IrrigationHistoryWidget.vue` — 실시간 상태 추가
- `frontend/src/views/Automation.vue` — 룰 활성화 시 원격제어 연동
- `frontend/src/views/Devices.vue` — 원격제어 OFF 시 룰 비활성화
- `frontend/src/views/Groups.vue` — 원격제어 OFF 시 룰 비활성화
- `frontend/src/stores/automation.store.ts` — 연동 로직 추가
- `frontend/src/api/automation.api.ts` — 새 API 호출 추가

---

## 6. 기존 로직 의존성

### 6.1 원격제어 ↔ 스케줄러 관계 (현재)

```
원격제어 ON  → 스케줄러가 룰 실행 가능
원격제어 OFF → 스케줄러가 룰 건너뜀 (silent skip)
룰 활성화    → 스케줄러가 다음 분에 체크
룰 비활성화  → 스케줄러가 무시
```

### 6.2 변경 후 관계

```
원격제어 ON  → 스케줄러가 룰 실행 가능 (변경 없음)
원격제어 OFF → 스케줄러 건너뜀 + 해당 장비 모든 룰 비활성화 (FR-04)
룰 활성화    → 원격제어 자동 ON (FR-03) + 스케줄러 체크
룰 비활성화  → 스케줄러 무시 (변경 없음)
모든 룰 비활성화 → 원격제어 상태 유지 (사용자가 직접 끔)
```

### 6.3 주의사항

- **개폐기 인터록 규칙** 적용 대상 아님 (관수 장비는 릴레이 제어)
- 원격제어 OFF 시 현재 가동 중인 관수가 있으면 **즉시 중단** 필요
- bulk-disable은 해당 장비의 **irrigation 타입 룰만** 대상 (일반 자동화 룰은 제외)

---

## 7. Success Criteria

### 7.1 Definition of Done

- [ ] 상태 모달에서 자동화 가동 상태 확인 가능
- [ ] 대시보드에서 관수 장비별 자동화 활성/가동 상태 확인 가능
- [ ] 룰 활성화 시 원격제어 자동 ON + 토스트 알림
- [ ] 원격제어 OFF 시 확인 다이얼로그 + 룰 일괄 비활성화 + 토스트 알림
- [ ] 기존 자동화 스케줄러 정상 동작 유지

### 7.2 Quality Criteria

- [ ] 가동 상태 정보가 10초 이내에 프론트엔드에 반영
- [ ] Gap Analysis Match Rate >= 90%

---

## 8. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 가동 상태 인메모리 → 서버 재시작 시 유실 | Medium | Low | DB에 실행 상태 플래그 추가 검토 |
| 원격제어 OFF 시 진행 중인 관수 중단 | High | Medium | 확인 다이얼로그에 "현재 가동 중" 경고 |
| 룰 bulk-disable 시 race condition | Low | Low | 트랜잭션으로 처리 |
| WebSocket 연결 끊김 | Medium | Medium | polling fallback (GET active API) |

---

## 9. Implementation Order

1. **Phase 1**: 백엔드 — 가동 상태 API + WebSocket 이벤트 + bulk-disable API
2. **Phase 2**: 프론트엔드 — 상태 모달 자동화 정보 표시 (FR-01)
3. **Phase 3**: 프론트엔드 — 대시보드 실시간 상태 (FR-02)
4. **Phase 4**: 프론트엔드 — 룰 활성화 ↔ 원격제어 양방향 연동 (FR-03, FR-04)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-02 | Initial draft | AI Assistant |
