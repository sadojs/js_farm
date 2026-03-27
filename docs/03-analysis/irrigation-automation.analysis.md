# Irrigation Automation Gap Analysis

> 분석일: 2026-03-27
> Plan: irrigation-automation.plan.md
> Design: N/A

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | FR-01: 관수 장비 UI (타이머/교반기 토글) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 2 | FR-02: 자동화 관수 조건 Step 4 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 3 | FR-03: 관수 스케줄러 백엔드 (시작시간~순서 실행) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 4 | FR-04: 자동화 목록 UI (요일/반복 표시) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 5 | FR-05: 그룹관리 자동화 편집 모달 (2단계) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 6 | Tuya 스위치 매핑 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 7 | 관수 조건 JSONB 스키마 | ✓ | N/A | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Design 문서 없음 (Plan만 존재)
- 5개 FR + 상세 기술 사양
- Tuya 스위치 매핑 정의:
  - switch_1: 타이머 전원/B접점
  - switch_2~6: 5개 구역 관수
  - switch_usb1: 교반기/B접점
  - switch_usb2: 액비모터
- Step 4: 시작시간 + 상세 설정(구역별 관수시간/대기시간/ON/OFF) + 반복 설정
- 복잡한 시뮬레이션: 액비 투여 시간(투여시간), 종료전대기 처리

## 개선 권고

- Tuya 스위치 코드 매핑 검증 (switch_usb1/switch_usb2 등)
- 관수 실행 로직의 타이밍 정확성 검증:
  - 구역별 순서 실행
  - 액비 투여 타이밍 (관수시간 - 투여시간 - 종료대기)
  - 교반기 ON/OFF 타이밍
- 관수 조건 JSONB 스키마 검증
- StepIrrigationCondition.vue 컴포넌트 구현 확인
