# UI Design Improvement Gap Analysis

> 분석일: 2026-03-27
> Plan: ui-design-improvement.plan.md
> Design: ui-design-improvement.design.md

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | FR-01: 토글 버튼 간격 개선 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 2 | FR-02: 시간 피커 (VueDatePicker time-picker) | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 3 | FR-03: 날짜 피커 (VueDatePicker calendar) | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 4 | FR-04: 센서 데이터 레이아웃 개선 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 5 | FR-02 구현: StepIrrigationCondition.vue | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 6 | FR-03 구현: Reports.vue 날짜 피커 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 7 | VueDatePicker 다크모드 연동 | ✓ | ✓ | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Plan과 Design 문서 모두 존재
- 4개 FR:
  1. FR-01: 토글 버튼 간격 (현재 8px → 개선 필요)
  2. FR-02: 시간 피커 (input[type=time] → VueDatePicker)
  3. FR-03: 날짜 피커 (input[type=date] → VueDatePicker)
  4. FR-04: 센서 데이터 카드 레이아웃 (Sensors.vue)
- VueDatePicker 통합:
  - StepIrrigationCondition.vue: startTime (HH:mm string)
  - Reports.vue: customStartDate/customEndDate (yyyy-MM-dd string)
  - model-type prop으로 기존 인터페이스 유지
- 다크모드 연동:
  - @vueuse/core의 useLocalStorage로 'sf-theme' 감지
  - :dark prop으로 VueDatePicker에 전달

## 개선 권고

- FR-01 토글 간격 개선 검증 (CSS 간격 재조정)
- FR-02/03 VueDatePicker 통합 검증:
  - StepIrrigationCondition.vue의 시간 피커 변환 로직 확인
  - Reports.vue의 날짜 피커 초기값 설정 확인
  - model-type="yyyy-MM-dd" (Reports) 또는 시간 변환 로직 검증
- FR-04 센서 데이터 레이아웃 검증:
  - Sensors.vue의 카드 레이아웃 개선 확인
  - 데이터 표시 간격 확인
- 다크모드 연동 검증:
  - useLocalStorage('sf-theme') 감지 로직 확인
  - VueDatePicker :dark prop 전달 확인
  - 라이트/다크 모드 전환 시 피커 UI 변경 확인

## 2026-03-27 구현 완료 항목

### 날짜 포맷 통일 (C-03 해결)
- **신규 유틸리티**: `frontend/src/utils/date-format.ts`
  - `formatDate(input)` → `yyyy-MM-dd`
  - `formatDateTime(input)` → `yyyy-MM-dd HH:mm`
  - `formatChartTimeLabel(dateStr, isShort)` → 차트용 시간 라벨
  - `formatRelativeTime(dateStr)` → 상대 시간 (N분 전)
- **적용 파일**: `Dashboard.vue`, `Reports.vue`, `Alerts.vue`
- **효과**: `toLocaleString('ko-KR')` 및 `M/D` 포맷 제거 → 전체 `yyyy-MM-dd HH:mm` 통일

### 모바일 모달 풀스크린 처리 (C-01 해결)
- **수정 파일**: `ProjectAssignModal.vue`, `UserFormModal.vue`, `DeleteBlockingModal.vue`
- **적용 속성**: `height: 100dvh`, `padding: 0`, `env(safe-area-inset-bottom)`, `overscroll-behavior: contain`
