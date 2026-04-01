# Plan: 관수 장비 12채널 템플릿 + 자동 채널 감지

## 개요

기존 8채널 관수 장비 매핑에 12채널 템플릿을 추가하고, IoT 장비의 실제 switch 코드 수를 감지하여 자동으로 8채널 또는 12채널 기본 매핑을 적용한다.

## 채널 템플릿 비교

### 8채널 (기존)

| 기능 | Switch 코드 |
|------|------------|
| 원격제어 ON/OFF | switch_1 |
| 1구역 관수 | switch_2 |
| 2구역 관수 | switch_3 |
| 3구역 관수 | switch_4 |
| 4구역 관수 | switch_5 |
| 액비/교반기 B접점 | switch_6 |
| 교반기 | switch_usb1 |
| 액비모터 | switch_usb2 |

### 12채널 (신규)

| 기능 | Switch 코드 |
|------|------------|
| 원격제어 ON/OFF | switch_1 |
| 1구역 관수 | switch_2 |
| 2구역 관수 | switch_3 |
| 3구역 관수 | switch_4 |
| 4구역 관수 | switch_5 |
| 5구역 관수 | switch_6 |
| 6구역 관수 | switch_7 |
| 7구역 관수 | switch_8 |
| 8구역 관수 | switch_9 |
| 액비/교반기 B접점 | switch_10 |
| 교반기 | switch_usb1 |
| 액비모터 | switch_usb2 |

### 차이점
- 8ch: zone 4개 (switch_2~5), B접점=switch_6
- 12ch: zone 8개 (switch_2~9), B접점=switch_10
- 공통: remote_control=switch_1, mixer=switch_usb1, fertilizer_motor=switch_usb2

## 자동 채널 감지 방식

Tuya 장비 상태 조회 시 반환되는 switch 코드 목록에서 `switch_N` 패턴 개수를 세어 판별:
- `switch_1` ~ `switch_6` 존재 (switch_7 없음) → **8채널**
- `switch_1` ~ `switch_10` 이상 존재 → **12채널**

감지 시점: 장비 상태 조회(getDeviceStatus) 또는 채널 매핑 편집 UI 진입 시

## 변경 범위

### Backend (2개 파일)

| 파일 | 변경 내용 |
|------|----------|
| `channel-mapping.constants.ts` | 12ch 기본 매핑 + AVAILABLE_SWITCH_CODES_12CH + 채널 수 판별 함수 추가 |
| `devices.service.ts` | getEffectiveMapping에서 채널 수 기반 기본 매핑 선택 |

### Frontend (4개 파일)

| 파일 | 변경 내용 |
|------|----------|
| `types/device.types.ts` | 12ch 타입/상수/AVAILABLE_SWITCH_CODES 확장 |
| `stores/device.store.ts` | getEffectiveMapping에서 채널 수 판별 로직 |
| `views/Devices.vue` | 채널 매핑 패널에서 8ch/12ch 자동 감지 표시 |
| `components/automation/StepIrrigationCondition.vue` | zone 필터를 4개→8개 동적 적용 |

### DB 변경: 없음
기존 channel_mapping JSONB 컬럼에 8개/12개 키가 모두 저장 가능

## 구현 순서

1. Backend constants: 12ch 템플릿 + 판별 함수
2. Backend service: getEffectiveMapping 수정
3. Frontend types: 12ch 상수 추가
4. Frontend store: 판별 로직
5. Frontend UI: Devices.vue, StepIrrigationCondition.vue 동적 zone 수
