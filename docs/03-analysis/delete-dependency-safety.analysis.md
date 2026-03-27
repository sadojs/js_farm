# Delete Dependency Safety Gap Analysis

> 분석일: 2026-03-27
> Plan: delete-dependency-safety.plan.md
> Design: delete-dependency-safety.design.md

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | FR-01: 장비 의존성 API (GET /devices/:id/dependencies) | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 2 | FR-02: 장비 삭제 차단 (409 Conflict) | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 3 | FR-03: 개폐기 쌍 원자적 삭제 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 4 | FR-04: 그룹 의존성 조회 API | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 5 | FR-05: 그룹 삭제 차단 + 의존성 안내 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 6 | FR-06: 의존성 모달 UI (Devices.vue/Groups.vue) | ✓ | ✓ | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Plan에서 현재 코드의 3가지 취약점 명시:
  - 장비 삭제 시 automation_rules 내 targetDeviceId 정리 없음
  - 그룹 삭제 시 고아 룰 발생 가능
  - 개폐기 파트너 장비의 pairedDeviceId null 처리 없음
- Design에서 "삭제 차단 + 의존성 안내" 전략 채택 (자동 비활성화 대신)
- 핵심: 409 Conflict API 응답과 의존성 목록 모달로 사용자에게 선택권 부여

## 개선 권고

- 백엔드 의존성 조회 API 2개(장비/그룹) 구현 검증 필수
- 의존성 모달 UI가 명확하게 "어디서 사용 중인지" 표시하는지 확인
- 개폐기 쌍 삭제 API의 원자성 검증 필요
