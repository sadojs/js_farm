# Modal Darkmode & Automation Fix Gap Analysis

> 분석일: 2026-03-27
> Plan: modal-darkmode-automation-fix.plan.md
> Design: N/A

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | FR-01: 모달 다크모드 적용 (10개 파일) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 2 | FR-01-1: 자동화 모달 6개 파일 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 3 | FR-01-2: 관리자/공통 모달 3개 파일 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 4 | FR-02: 자동화 룰 저장 버그 (UpdateRuleDto groupId) | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 5 | FR-03: 센서 미선택 옵션 + 시간 조건 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 6 | FR-02 백엔드: UpdateRuleDto 수정 | ✓ | N/A | 검증 필요 | NEED_CHECK |
| 7 | FR-03 프론트: StepSensorSelect 수정 | ✓ | N/A | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Design 문서 없음 (Plan만 존재)
- 3개 FR로 구성:
  1. FR-01: 모달 다크모드 (10개 파일, 하드코딩 색상 → CSS 변수)
  2. FR-02: Critical 버그 — UpdateRuleDto에 groupId 누락
  3. FR-03: 센서 미선택 옵션 추가 (시간 기반 자동화)
- FR-02의 근본 원인: `forbidNonWhitelisted: true` + groupId 필드 없음 → 400 에러
- FR-03: "센서 미선택 (시간 기반)" 버튼으로 sensorDeviceIds=[] 허용

## 개선 권고

- FR-02 백엔드 수정 검증 필수 (Critical):
  - create-rule.dto.ts의 UpdateRuleDto에 groupId 필드 추가
  - automation.service.ts update() 메서드에서 groupId 업데이트 로직 확인
- FR-01 모달 다크모드:
  - 10개 파일의 모든 하드코딩 색상 → CSS 변수 변환 확인
  - white → var(--bg-card), #333 → var(--text-primary) 등
- FR-03 프론트엔드:
  - StepSensorSelect에서 "센서 미선택" 버튼 추가 확인
  - StepConditionBuilder에서 센서 미선택 시 time 필드만 표시 확인
