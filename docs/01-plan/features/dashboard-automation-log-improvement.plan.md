# dashboard-automation-log-improvement Plan

> 대시보드 관수 현황 위젯 개선 + 자동화 실행 로그 범용화 및 버그 수정

## 1. 배경 및 문제점

### 1.1 대시보드 관수 현황 위젯 (IrrigationHistoryWidget)

**현재 상태:**
- 장비 이름만 표시 (룰 내용/스케줄 요약 없음)
- 장비가 여러 대일 때 세로로 길어지기만 하는 단순 리스트 구조
- 농장(그룹)이 여러 개일 때 구분 없이 모든 장비가 한꺼번에 나열됨

**문제:**
- 관수 장비가 3~4대 이상이면 위젯이 과도하게 길어짐
- 어떤 농장(그룹)의 장비인지 알 수 없음
- 룰 이름만 나오고, "19:10 시작 / 4구역 중 2구역 활성" 같은 요약 정보 없음

### 1.2 자동화 실행 로그

**현재 상태:**
- 위젯 제목이 "관수 현황"이지만 로그는 모든 자동화 룰의 실행 결과를 보여줌 (불일치)
- 백엔드 `getLogs()` API가 룰 이름을 JOIN하지 않아, 프론트에서 `ruleName`이 항상 undefined → `'규칙'`으로 표시
- 관수 스케줄러는 **전체 관수 완료 후에만** 로그 1건 기록 → 관수 시작 시점에는 로그 없음
- 일반 자동화 룰(팬, 개폐기 등)은 매 분 실행마다 로그 기록 → 로그 폭발 가능성

**버그:**
- `getLogs()`에서 `ruleName`을 반환하지 않는 백엔드 누락
- 관수 도중(아직 완료 전)에는 실행 로그가 0건으로 보임

## 2. 요구사항

### FR-01: 위젯 구조 개선 — 그룹별 관수 현황

- 관수 장비를 **그룹(농장)별로 묶어서** 표시
- 그룹명 헤더 아래에 해당 장비 리스트
- 장비가 많을 경우 최대 2~3개만 노출하고 "외 N대" 표시 또는 아코디언/접기

### FR-02: 룰 요약 정보 표시

- 각 관수 장비의 활성 룰에 대해 간략 요약 표시:
  - 시작 시간 (예: "19:10")
  - 활성 구역 수 / 전체 구역 수 (예: "2/4구역")
  - 다음 예정 실행 요일 (예: "월수금")
- 가동 중일 때는 현재 실행 중인 룰의 진행률 또는 남은 시간

### FR-03: 자동화 페이지 실행 로그 개선

- 대시보드 위젯은 **관수 현황 전용** 유지 (관수는 핵심 시설이므로)
- 대시보드 위젯 하단의 "최근 실행" 로그 → 관수 관련 로그만 표시
- **자동화 페이지**(Automation.vue)의 "실행 로그" 탭에서 **전체 자동화 실행 현황** 표시 (관수 + 팬 + 개폐기 등)
- AutomationLogTimeline 컴포넌트의 ruleName 표시 정상화

### FR-04: 백엔드 getLogs() — ruleName JOIN 추가

- `getLogs()` 쿼리에 `automation_rules` 테이블 LEFT JOIN하여 `ruleName` 포함 반환
- 프론트에서 `log.ruleName`이 실제 룰 이름으로 표시되도록 보장

### FR-05: 관수 시작 로그 기록

- 관수 스케줄러에서 **관수 시작 시점**에도 로그 1건 기록
  - `success: true`, `conditionsMet: { type: 'irrigation_started', startTime }`
  - 또는 기존 완료 로그와 구분되는 별도 타입
- 사용자가 "오늘 관수를 실행했는데 로그가 없다"는 문제 해결

## 3. 범위 (Scope)

### In Scope
- IrrigationHistoryWidget 리팩토링 (그룹별 묶기 + 룰 요약)
- 백엔드 getLogs() API 개선 (ruleName JOIN)
- 관수 시작 로그 추가
- 양 프로젝트 동시 반영 (smart-farm-platform, smart-farm-mqtt)

### Out of Scope
- 로그 페이지네이션/무한 스크롤 (현재 5건 표시로 충분)
- 로그 보관/삭제 정책 (별도 기능)
- 자동화 실행 상세 페이지 (별도 기능)

## 4. 구현 순서

1. **FR-04**: 백엔드 getLogs() ruleName JOIN — 가장 기본, 모든 프론트 개선의 전제
2. **FR-05**: 관수 시작 로그 기록 — 버그 수정 성격
3. **FR-01 + FR-02**: 위젯 UI 리팩토링 — 그룹별 묶기 + 룰 요약
4. **FR-03**: 위젯 범위 확장 — 제목 변경 + 전체 자동화 로그 표시

## 5. 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `backend/.../automation.service.ts` | getLogs() JOIN 추가 |
| `backend/.../irrigation-scheduler.service.ts` | 시작 로그 추가 |
| `frontend/.../IrrigationHistoryWidget.vue` | UI 리팩토링 |
| `frontend/.../automation.api.ts` | IrrigationDeviceStatus에 그룹 정보 포함 여부 |
| `frontend/.../automation-log.api.ts` | ruleName 타입 필수화 검토 |

## 6. 리스크

- 관수 시작 로그 추가 시 기존 stats 카운트가 2배로 늘어남 (시작+완료) → stats 쿼리에서 타입 구분 필요할 수 있음
- 그룹별 묶기를 위해 irrigationStatus API 응답에 groupId/groupName 추가 필요할 수 있음
