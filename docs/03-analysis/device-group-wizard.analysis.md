# Device Group Wizard Gap Analysis

> 분석일: 2026-03-27
> Plan: device-group-wizard.plan.md
> Design: device-group-wizard.design.md

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | FR-01: 위저드 Step 4 추가 (그룹 설정 안내) | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 2 | FR-02: Step 4a - 기존 그룹 선택 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 3 | FR-03: Step 4b - 새 그룹 생성 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 4 | FR-04: 권한 매트릭스 구현 (admin/farm_admin만 Step 4 노출) | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 5 | FR-05: DeviceRegistration.vue 수정 (Step 4 로직) | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 6 | FR-06: Devices.vue 권한 가드 추가 | ✓ | ✓ | 검증 필요 | NEED_CHECK |
| 7 | FR-07: 스텝 인디케이터 UI | ✓ | ✓ | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Plan: 장비 등록 후 그룹 설정까지 연속 UX 흐름 개선
- Design: 세부 Step 4(a/b) 템플릿 + 권한 매트릭스 정의
  - admin/farm_admin: Step 4 노출
  - farm_user: "+ 장비 추가" 버튼 자체 숨김
- 기존 groupStore API (fetchGroups, createGroup, assignDevices) 재사용
- "나중에" 옵션으로 기존 흐름과의 호환성 유지

## 개선 권고

- DeviceRegistration.vue의 registerDevices() 함수에서 권한 분기 로직 검증 필수
- Devices.vue의 "+ 장비 추가" 버튼 2곳(헤더/empty state) 모두 가드 적용 확인
- Step 4 진입 시 groupStore.fetchGroups() 호출 타이밍 검증

## 2026-03-27 구현 후 보완

### 체크박스 클릭 버그 수정
- **파일**: `DeviceRegistration.vue`
- **이슈**: 기기 선택 체크박스에 `@click.stop`이 걸려 있어 체크박스 직접 클릭 시 부모 div의 `toggleDeviceSelection()` 미호출
- **수정**: `@click.stop` → `class="no-interact" tabindex="-1"` + `pointer-events: none` CSS
- **효과**: 체크박스가 순수 표시용으로만 동작, 부모 div 클릭 이벤트만 반영
