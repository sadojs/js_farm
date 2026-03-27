# Report Page Gap Analysis

> 분석일: 2026-03-27
> Plan: report-page.plan.md
> Design: N/A

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | FR-01: UI 리디자인 (필터/통계/차트/테이블) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 2 | FR-01-1: 하우스 선택 제거 (그룹만 유지) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 3 | FR-01-2: 기간 선택 버튼 그룹 (1일/7일/1개월/기간) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 4 | FR-01-3: 통계 카드 3개 (온도/습도/가동시간) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 5 | FR-01-4: 차트 2개 (온습도+가동현황) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 6 | FR-02: 초기 렌더링 기본값 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 7 | FR-03: 백엔드 API 보완 | ✓ | N/A | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Design 문서 없음 (Plan만 존재)
- 4개 FR로 구성:
  1. FR-01: 리포트 페이지 전체 UI 리디자인
  2. FR-02: 초기 렌더링 기본값 (12시간 이내)
  3. FR-03: 백엔드 API 보완 (hourly 집계, actuator 통계)
  4. FR-04: CSV/PDF 다운로드
- 필터: 그룹 선택 (하우스 제거) + 센서 타입 + 기간
- 차트 라이브러리: chart.js + vue-chartjs (이미 설치)
- 날짜 라이브러리: dayjs (이미 설치)
- 시간별 집계: date_trunc('hour') SQL (hourly 테이블 미존재)

## 개선 권고

- FR-01 UI 리디자인 검증:
  - 필터 UI (그룹/센서/기간) 레이아웃 확인
  - 통계 카드 3개 표시 확인
  - Line Chart (온도/습도 이중축) 구현 확인
  - Bar Chart (장비 가동 현황) 구현 확인
  - 상세 데이터 테이블 확인
- FR-02 초기값 검증:
  - 페이지 진입 시 현재~12시간 전 범위 자동 조회
  - 첫 그룹 자동 선택 확인
- FR-03 백엔드 검증:
  - getHourlyData() date_trunc 쿼리 검증
  - getActuatorStats() automation_logs 조회 검증
