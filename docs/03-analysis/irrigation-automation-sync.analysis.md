# irrigation-automation-sync Gap Analysis

> **Match Rate: 96%**
>
> **Date**: 2026-04-03

## 분석 개요

| 항목 | 내용 |
|------|------|
| Feature | irrigation-automation-sync (관수 자동화 연동) |
| 설계 문서 | `docs/02-design/features/irrigation-automation-sync.design.md` |
| 비교 프로젝트 | smart-farm-platform + smart-farm-mqtt |

## 설계 항목별 구현 상태

### Backend (25개 중 25개 구현)

| 설계 항목 | 구현 상태 | 비고 |
|-----------|:---------:|------|
| GET /api/automation/irrigation/status | O | controller + service 구현 |
| POST /api/automation/rules/bulk-disable | O | controller + service 구현 |
| ActiveIrrigation 확장 (ruleName, estimatedEndAt) | O | deviceId 필드 추가 (설계 대비 개선) |
| getActiveByDevice() | O | irrigation-scheduler.service.ts |
| stopByDevice() | O | 스위치 OFF 명령까지 포함 (설계 대비 강화) |
| startIrrigation/cleanup 이벤트 emit | O | EventEmitter2 연동 |
| EventsGateway emitIrrigationStarted/Stopped | O | WebSocket 브로드캐스트 |
| toggle() options 확장 + ensureRemoteControlOn | O | automation.service.ts |

### Frontend API/Store/WebSocket

| 설계 항목 | 구현 상태 | 비고 |
|-----------|:---------:|------|
| automationApi.getIrrigationStatus | O | automation.api.ts |
| automationApi.bulkDisableByDevice | O | automation.api.ts |
| IrrigationDeviceStatus 타입 | O | automation.api.ts |
| store: irrigationStatus + fetch/bulk/getter | O | automation.store.ts |
| WebSocket irrigation:started/stopped 수신 | O | useWebSocket.ts |

### Frontend UI (FR-01 ~ FR-04)

| 설계 항목 | 구현 상태 | 비고 |
|-----------|:---------:|------|
| FR-01: IrrigationStatusModal 자동화 배지 | O | 자동화 ON/OFF 컬럼 추가 (설계 대비 강화) |
| FR-02: IrrigationHistoryWidget 실시간 상태 | O | 15초 폴링 추가 (설계 대비 강화) |
| FR-03: Automation.vue handleToggle autoEnableRemote | O | 토스트 메시지 세분화 미적용 (Minor) |
| FR-04: Devices.vue/Groups.vue 확인 다이얼로그 + bulkDisable | O | 양쪽 뷰 모두 구현 |

### AutomationEditModal channelMapping 전달 (추가 구현)

| 항목 | platform | mqtt |
|------|:--------:|:----:|
| channelMapping prop 전달 | O | O |
| editableMapping prop 전달 | O | O |
| update:channelMapping 핸들링 | O | O |
| canEditMapping 권한 체크 (admin/farm_admin) | O | O |
| initChannelMapping 장비 매핑 로드 | O | O |

## 미구현/불일치 항목

| 항목 | 심각도 | 설명 |
|------|:------:|------|
| FR-03 토스트 "원격제어가 자동으로 활성화되었습니다" | Low | 현재 일반 토스트만 표시, 원격제어 자동 ON 별도 토스트 미표시 |

## 추가 구현 (설계 대비 개선)

| 항목 | 설명 |
|------|------|
| IrrigationStatusModal 자동화 ON/OFF 컬럼 | 채널별 자동화 상태 직접 확인 가능 |
| IrrigationHistoryWidget 15초 폴링 | 가동중 장비 실시간 갱신 |
| stopByDevice 스위치 OFF 명령 | 타이머 취소 + 실제 스위치 OFF (안전성) |
| ActiveIrrigation.deviceId 필드 | DB deviceId 포함으로 조회 편의성 향상 |

## 프로젝트 간 일관성: 95%

smart-farm-platform과 smart-farm-mqtt 간 동일 기능 구현 확인. 아키텍처 차이(Tuya vs MQTT)만 존재.

## 권장 조치

- (선택) FR-03 원격제어 자동 ON 토스트 메시지 세분화
- (선택) 설계 문서에 추가 구현 사항 반영
