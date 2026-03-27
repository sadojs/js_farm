# Automation Device v2 Gap Analysis

> 분석일: 2026-03-27
> Plan: automation-device-v2.plan.md
> Design: automation-device-v2.design.md

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | FR-01: 장비 단일 선택 + 개폐기 숨김 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 2 | FR-02: 히스테리시스 조건 UI + 백엔드 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 3 | FR-03: 시간대 스케줄러 UI + 백엔드 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 4 | FR-04: 릴레이 동작대기 옵션 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 5 | FR-05: 개폐기 타입 분리 (opener_open/opener_close) | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 6 | FR-06: 개폐기 페어링 검증 + 등록 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 7 | FR-07: 개폐기 인터록 제어 | ✓ | ✓ | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Plan과 Design이 7개 FR로 체계적으로 구성됨
- A. 자동화 룰 위저드 로직 변경 (FR-01~04)
- B. 장비 등록 창 개선 (FR-05~07)
- 복잡한 요구사항: 히스테리시스, 시간대 스케줄러, 릴레이 동작, 개폐기 페어링/인터록
- Design에서 7개 Phase로 구현 순서 정의됨

## 개선 권고

- Design 문서에 정의된 구현 순서(7 Phase)를 따라 단계별 검증 필요
- 특히 FR-02(히스테리시스) 백엔드 로직과 FR-07(인터록) 시간 제어 검증 중요
- 개폐기 관련 3개 FR(05,06,07)은 상호 의존도 높으므로 연동 테스트 필수
