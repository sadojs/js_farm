# Plan: 관수 장비 릴레이 채널 동적 매핑 (irrigation-relay-mapping)

## 개요

현재 관수 장비의 switch 코드 매핑(switch_1~6, switch_usb1~2)이 코드에 하드코딩되어 있어, 농장마다 다른 릴레이 배선 순서를 반영할 수 없다. 이를 장비별로 DB에 저장하고 admin/farm_admin이 UI에서 직접 변경 가능하도록 개선한다. 아울러 원격제어(switch_1) 동작 방식 및 장비 관리 UI 표시를 함께 수정한다.

---

## 현황 분석

### 현재 하드코딩 위치

| 파일 | 위치 | 내용 |
|------|------|------|
| `irrigation-scheduler.service.ts` | L28-34 | `ZONE_SWITCH_MAP: { 1:'switch_2', 2:'switch_3', ... }` |
| `irrigation-scheduler.service.ts` | L206, 218, 230 | `switch_usb1`, `switch_usb2` 직접 참조 |
| `automation-runner.service.ts` | L569, 596, 604 | `switch_1` 직접 참조 (타이머/원격제어) |
| `Devices.vue` | L102, 112 | `switch_1`, `switch_usb1` 토글 클릭 하드코딩 |
| `Groups.vue` | L112, 119 | 동일 |
| `Devices.vue` / `Groups.vue` | IRRIGATION_SWITCH_LABELS | 8개 switch 라벨 하드코딩 |

### 현재 기본 매핑 (변경 전)

```
switch_1    → 타이머 전원/B접점
switch_2    → 1구역 관수
switch_3    → 2구역 관수
switch_4    → 3구역 관수
switch_5    → 4구역 관수
switch_6    → 5구역 관수
switch_usb1 → 교반기 모터/B접점
switch_usb2 → 액비모터
```

### 역할 구조 (기존)
- `admin` = 플랫폼 어드민
- `farm_admin` = 농장 관리자
- `farm_user` = 일반 사용자

---

## 요구사항

### FR-01: 새 기본 채널 매핑 정의

기능(function key)을 고정하고, 그 기능에 어떤 switch 코드가 연결될지를 장비별로 설정 가능하게 한다.

**신규 기본 매핑 (변경 후)**

| 기능 키 (function_key) | 기본 switch 코드 | 표시 이름 |
|------------------------|-----------------|-----------|
| `remote_control`       | `switch_1`      | 원격제어 ON/OFF |
| `fertilizer_b_contact` | `switch_6`      | 액비/교반기 B접점 |
| `zone_1`               | `switch_2`      | 1구역 관수 |
| `zone_2`               | `switch_3`      | 2구역 관수 |
| `zone_3`               | `switch_4`      | 3구역 관수 |
| `zone_4`               | `switch_5`      | 4구역 관수 |
| `mixer`                | `switch_usb1`   | 교반기 |
| `fertilizer_motor`     | `switch_usb2`   | 액비모터 |

> **핵심 변경**: 기존 5구역(`switch_6`)이 `액비/교반기 B접점`으로 기능 변경됨

---

### FR-02: DB 채널 매핑 저장

- `devices` 테이블에 `channel_mapping` JSONB 컬럼 추가
- NULL이면 시스템 기본 매핑(FR-01) 사용
- 저장 예시:
  ```json
  {
    "remote_control": "switch_1",
    "fertilizer_b_contact": "switch_6",
    "zone_1": "switch_2",
    "zone_2": "switch_3",
    "zone_3": "switch_4",
    "zone_4": "switch_5",
    "mixer": "switch_usb1",
    "fertilizer_motor": "switch_usb2"
  }
  ```

---

### FR-03: 채널 매핑 설정 UI

- **접근 권한**: `admin`, `farm_admin`만 표시
- **위치**: 장비 관리(Devices.vue, Groups.vue)의 관수 장비 카드 내 설정 영역
- **UI**: 각 기능(function_key)별로 switch 코드를 드롭다운으로 선택
  - 선택 가능 코드: `switch_1~6`, `switch_usb1`, `switch_usb2`
  - 중복 배정 경고 표시 (같은 switch를 두 기능에 배정 시)
- **저장**: `PATCH /api/devices/:id/channel-mapping` API 호출
- `farm_user`는 설정 패널 자체를 렌더링하지 않음 (숨김)

---

### FR-04: 원격제어 동작 변경

원격제어(`remote_control` → 기본 `switch_1`)는 전체 IoT 활성화/비활성화 마스터 스위치다.

**동작 규칙:**

1. **원격제어 ON** → 백엔드에서 `fertilizer_b_contact`(기본 `switch_6`)도 자동 ON
2. **원격제어 OFF** → 백엔드에서 `fertilizer_b_contact`도 자동 OFF
   + 나머지 모든 기능(zone_1~4, mixer, fertilizer_motor)도 강제 OFF
   (자동화 룰로 인해 ON 상태여도 백엔드에서 OFF 처리)
3. 원격제어가 OFF인 동안 자동화 스케줄러는 관수 장비에 명령을 보내지 않음

---

### FR-05: 장비 관리 UI 표시 변경 (Devices.vue, Groups.vue)

**변경 전:**
- `switch_1` 토글: "타이머 전원/B접점" (조작 가능)
- `switch_usb1` 토글: "교반기/B접점" (조작 가능)

**변경 후:**
- `remote_control` 매핑 switch 토글: "원격제어 ON/OFF" (**조작 가능**)
- `fertilizer_b_contact` 매핑 switch 토글: "액비/교반기 B접점" (**조작 불가** - 표시만)

> 액비/교반기 B접점은 원격제어 ON/OFF와 연동되어 자동으로 동작하므로 수동 제어 불필요

---

### FR-06: 백엔드 서비스 동적 매핑 적용

- `irrigation-scheduler.service.ts`의 `ZONE_SWITCH_MAP` 상수를 제거하고, 장비의 DB 채널 매핑을 런타임에 읽어 사용
- `automation-runner.service.ts`의 `switch_1` 하드코딩을 `remote_control` 매핑으로 대체
- 장비에 `channel_mapping`이 없으면 시스템 기본값(FR-01) 사용

---

## 수정 파일 목록

### Backend

| 파일 | 변경 내용 |
|------|-----------|
| `backend/database/schema.sql` | `devices` 테이블에 `channel_mapping JSONB` 컬럼 추가 (migration) |
| `backend/src/modules/devices/entities/device.entity.ts` | `channelMapping` 필드 추가 |
| `backend/src/modules/devices/devices.service.ts` | `updateChannelMapping()`, `getEffectiveMapping()` 메서드 추가 |
| `backend/src/modules/devices/devices.controller.ts` | `PATCH /devices/:id/channel-mapping` 엔드포인트 (admin/farm_admin 권한) |
| `backend/src/modules/automation/irrigation-scheduler.service.ts` | `ZONE_SWITCH_MAP` → DB 매핑으로 대체, 원격제어 OFF 시 스케줄 스킵 로직 |
| `backend/src/modules/automation/automation-runner.service.ts` | `switch_1` 하드코딩 → `remote_control` 매핑으로 대체, 원격제어 OFF 시 강제 OFF 로직 |

### Frontend

| 파일 | 변경 내용 |
|------|-----------|
| `frontend/src/stores/device.store.ts` | `channelMapping` 상태 저장, `updateChannelMapping()` action 추가 |
| `frontend/src/views/Devices.vue` | 토글 UI 변경(FR-05), 채널 매핑 설정 패널 추가(FR-03) |
| `frontend/src/views/Groups.vue` | 동일 |
| `frontend/src/types/automation.types.ts` 또는 신규 타입 파일 | `ChannelMapping` 인터페이스 추가 |

---

## 구현 순서

```
1. [Backend] DB 마이그레이션 (channel_mapping 컬럼)
2. [Backend] Device 엔티티/서비스 - getEffectiveMapping 유틸리티
3. [Backend] PATCH API (admin/farm_admin guard)
4. [Backend] irrigation-scheduler - 동적 매핑 적용 + 원격제어 OFF 스킵
5. [Backend] automation-runner - remote_control 동적 매핑 + B접점 연동 로직
6. [Frontend] device.store - channelMapping 상태/액션
7. [Frontend] Devices.vue / Groups.vue - 토글 UI 변경 (FR-05)
8. [Frontend] Devices.vue / Groups.vue - 채널 매핑 설정 패널 (FR-03)
```

---

## 비기능 요구사항

- 채널 매핑이 없는 기존 장비는 기본 매핑으로 자동 동작 (하위 호환)
- `farm_user`에게는 채널 매핑 설정 UI 미노출
- 채널 매핑 변경 이력은 별도 관리 불필요 (현재 값만 저장)
- 자동화 룰 생성 화면(StepConditionBuilder)의 relay 기능은 현행 유지

---

## 영향 범위

**직접 영향:**
- 관수 장비 제어 로직 전반 (scheduler, runner)
- 장비 관리 화면 (Devices, Groups)
- 장비 DB 스키마

**간접 영향 (변경 없음):**
- 자동화 룰 생성 UI (StepConditionBuilder) - relay 조건은 유지
- 센서/날씨 조건 로직
- 환풍기/개폐기 제어 로직
