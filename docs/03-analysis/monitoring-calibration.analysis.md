# Monitoring Calibration Gap Analysis

> 분석일: 2026-03-27
> Plan: monitoring-calibration.plan.md
> Design: N/A

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | FR-01: VPD 단계별 가중 구간 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 2 | FR-02: 환기 필요도 VPD 교차검증 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 3 | FR-03: 결로위험 4단계화 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 4 | FR-04: 온습도 주/야간 목표 분리 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 5 | 환경점수 S_cond 재계산 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 6 | 코칭 문구 주/야간 분기 | ✓ | N/A | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Design 문서 없음 (Plan만 존재)
- 4개 FR: VPD, 환기, 결로, 온습도 보정
- 핵심 개선:
  1. VPD OK 구간을 생육 단계별로 변경:
     - vegetative: 0.6~1.0 (LOW<0.3, HIGH>1.2)
     - flowering_fruit: 0.8~1.2 (LOW<0.4, HIGH>1.4)
     - harvest: 1.0~1.6 (LOW<0.5, HIGH>1.8)
  2. 환기 필요도에서 VPD 교차검증 추가
  3. 결로위험 4단계: critical(0~1°C) / danger(1~2°C) / warning(2~4°C) / safe(4°C+)
  4. 온습도 주/야간 분리:
     - 주간(06~18): 22~26°C, 60~75% RH
     - 야간(18~06): 16~18°C, 65~85% RH
- 수정 파일 4개: widget-calculations.ts, MonitoringWidgets.vue, dashboard.service.ts, dashboard.controller.ts

## 개선 권고

- widget-calculations.ts의 calcVPD() 함수에 stage 파라미터 추가 검증
- calcVentScore() 함수의 VPD 교차검증 로직(40% 감쇠) 검증
- calcCondensationRisk() 함수의 4단계 매핑 검증
- getDayNightParams() 함수의 시간대 구간 (06~18) 검증
- 환경점수 S_cond 재계산 로직 검증 (단계별 매핑: critical→0.0, danger→0.3, warning→0.7, safe→1.0)
