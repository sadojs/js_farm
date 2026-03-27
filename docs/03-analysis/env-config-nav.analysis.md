# Environment Config Navigation Gap Analysis

> 분석일: 2026-03-27
> Plan: env-config-nav.plan.md
> Design: N/A

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | Bug 1: "환경 설정하기" 버튼 미동작 (Sensors.vue) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 2 | Bug 2: "환경 설정하기" 버튼 미동작 (Reports.vue) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 3 | Bug 3: Reports 환경 미설정 시 데이터 표시 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 4 | FR-01: Sensors.vue router-link 경로 수정 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 5 | FR-02: Reports.vue router-link 경로 수정 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 6 | FR-03: Groups.vue envConfig 쿼리 감지 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 7 | FR-04: Reports.vue envWarning 시 데이터 숨김 | ✓ | N/A | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Design 문서 없음 (Plan만 존재)
- 버그 3개와 FR 4개로 구성
- 핵심 문제:
  1. `/settings/env-config` 라우트 미존재 → 404
  2. Reports 환경 미설정 시 여전히 데이터 표시 (envWarning 체크 누락)
- 해결책: `/groups?envConfig=<groupId>` 쿼리 파라미터 활용

## 개선 권고

- Sensors.vue와 Reports.vue의 router-link 2곳 모두 경로 변경 검증
- Groups.vue onMounted에서 route.query.envConfig 감지 로직 검증
- Reports.vue의 hourlyData.length > 0 조건에 !envWarning 추가 확인
