# dashboard-automation-log-improvement Gap Analysis

> **Match Rate: 93%**
>
> **Date**: 2026-04-03

## FR별 구현 상태

| FR | 내용 | platform | mqtt | 판정 |
|----|------|:--------:|:----:|:----:|
| FR-01 | 그룹별 묶기 (groupId/groupName/UI) | O | O | 완전 일치 |
| FR-02 | 룰 요약 (startTime/zones/days) | O | O | 완전 일치 |
| FR-03 | 대시보드 관수 로그만 / 자동화 페이지 전체 | O | O | 완전 일치 |
| FR-04 | getLogs() ruleName 반환 | O | O | 기능 일치 (방식 변경) |
| FR-05 | 관수 시작 로그 (irrigation_started) | O | O | 완전 일치 |

## 변경 사항 (설계 != 구현)

| 항목 | 설계 | 구현 | 영향도 |
|------|------|------|:------:|
| getLogs() JOIN 방식 | leftJoin + getRawAndEntities() | findByIds + Map | Low |
| ruleName 타입 | `string \| null` | `string?` | Low |

## 추가 구현 (설계 대비 개선)

- 그룹 1개일 때 그룹 헤더 숨김
- 가동중 장비 15초 폴링 유지
- 로그 타입별 라벨 구분 (시작/완료/실패)

## mqtt 타입 불일치 (Minor)

- `automation.api.ts`의 `IrrigationDeviceStatus.tuyaDeviceId` → 백엔드는 `friendlyName`으로 반환
- UI에서 직접 참조하지 않아 런타임 오류 없음

## 양 프로젝트 동기화: 90%

장비 식별자 필드명(tuyaDeviceId vs friendlyName)만 차이, 나머지 동일.
