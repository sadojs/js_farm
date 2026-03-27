# Platform Fix v3 Gap Analysis

> 분석일: 2026-03-27
> Plan: platform-fix-v3.plan.md
> Design: N/A

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | FR-01: 센서 표시 필드 필터링 (5개만) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 2 | FR-01-1: SENSOR_FIELD_META 업데이트 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 3 | FR-01-2: automation-helpers.ts 필터링 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 4 | FR-02: 대시보드 격자/API 카드 제거 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 5 | FR-02-1: 날씨 아이콘 크기 확대 (20px→28px) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 6 | FR-03: 다크모드 background: white 교체 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 7 | FR-04: 자동화 카드 border-left 제거 | ✓ | N/A | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Design 문서 없음 (Plan만 존재)
- 4개 FR로 구성:
  1. FR-01: 센서 표시 필드를 7개 → 5개로 제한 (temperature, humidity, rain, UV, dew_point)
  2. FR-02: 대시보드 격자(NX/NY) + API 카드 제거, 날씨 크기 확대
  3. FR-03: 여러 파일의 background: white → CSS 변수 교체
  4. FR-04: Automation.vue의 카드 좌측 보더(녹색) 제거
- 우선순위: FR-01/03 High, FR-02 Medium, FR-04 Low
- DB 기록은 전체 유지, UI 표시만 필터링

## 개선 권고

- FR-01 검증:
  - SENSOR_FIELD_META에 rain, uv, dew_point 추가 확인
  - Sensors.vue에서 5개만 표시 확인
  - StepConditionBuilder.vue 필드 드롭다운 5개만 표시 확인
- FR-02 검증:
  - Dashboard.vue의 NX/NY 행 제거 확인
  - 조회 정보 카드(.info-card) 전체 제거 확인
  - 날씨 아이콘 20px→28px 확인
- FR-03 검증:
  - 4+ 파일의 background: white → var(--bg-card) 교체 확인
- FR-04 검증:
  - Automation.vue 카드의 border-left 제거 확인
