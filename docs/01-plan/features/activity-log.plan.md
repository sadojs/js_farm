# activity-log Plan

> 플랫폼 전체 활동 로그 시스템 — 사이드바 독립 페이지 + 사용자 행동 추적

## 1. 배경 및 문제점

### 1.1 현재 상태
- 자동화 실행 로그가 "자동화 룰" 페이지 내 탭으로만 존재 → 일반 사용자 접근성 낮음
- 자동화 실행 로그만 기록 → 장비 제어, 룰 활성화/비활성화, 설정 변경 등 사용자 행동은 기록 안 됨
- admin이 어떤 농장에서 누가 무엇을 했는지 파악 불가

### 1.2 요구사항 요약
- 활동 로그를 **사이드바 메인 메뉴**로 독립 (모든 사용자 접근 가능)
- 자동화 실행 로그 + **사용자 행동 로그**를 통합 표시
- 농장(그룹)별 필터링
- **admin**: 모든 농장의 모든 사용자 로그 열람
- **farm_admin/farm_user**: 자기 농장 로그만

## 2. 요구사항

### FR-01: 사이드바 "활동 로그" 메뉴 추가

- BottomTabBar와 사이드바에 "활동 로그" 메뉴 항목 추가
- 아이콘: 시계/히스토리 아이콘
- 모든 역할(admin, farm_admin, farm_user) 접근 가능
- 새 뷰: `ActivityLog.vue`
- 라우터 경로: `/activity-log`

### FR-02: 활동 로그 백엔드 — activity_logs 테이블

- 새 테이블 `activity_logs` 생성 (기존 `automation_logs`와 별도)
- 스키마:
  ```
  id          UUID PK
  user_id     FK → users
  user_name   VARCHAR (로그 시점 사용자명 스냅샷)
  group_id    FK → house_groups (nullable)
  group_name  VARCHAR (nullable, 스냅샷)
  action      VARCHAR — 행동 타입 (아래 목록)
  target_type VARCHAR — 대상 종류 (device, rule, group, sensor 등)
  target_id   VARCHAR (nullable)
  target_name VARCHAR (nullable, 스냅샷)
  details     JSONB — 상세 정보
  created_at  TIMESTAMPTZ
  ```

- 행동 타입 (action) 목록:
  | action | 설명 | target_type |
  |--------|------|-------------|
  | `device.control` | 장비 수동 제어 (ON/OFF) | device |
  | `device.register` | 장비 등록 | device |
  | `device.delete` | 장비 삭제 | device |
  | `rule.create` | 자동화 룰 생성 | rule |
  | `rule.update` | 자동화 룰 수정 | rule |
  | `rule.enable` | 자동화 룰 활성화 | rule |
  | `rule.disable` | 자동화 룰 비활성화 | rule |
  | `rule.delete` | 자동화 룰 삭제 | rule |
  | `rule.execute` | 자동화 룰 자동 실행 | rule |
  | `irrigation.start` | 관수 시작 | rule |
  | `irrigation.complete` | 관수 완료 | rule |
  | `irrigation.cancel` | 관수 취소 | rule |
  | `group.create` | 그룹 생성 | group |
  | `group.update` | 그룹 수정 | group |
  | `sensor.sync` | 센서 동기화 | sensor |
  | `env.update` | 환경설정 변경 | env_config |

### FR-03: 활동 로그 API

- `GET /api/activity-logs` — 로그 목록 조회
  - Query params: `page`, `limit`, `groupId`, `action`, `targetType`, `from`, `to`
  - admin: 전체 조회 가능 (groupId 필터 선택)
  - farm_admin/farm_user: 자기 그룹만
- `GET /api/activity-logs/stats` — 오늘 활동 요약
  - 오늘 총 건수, 액션 타입별 건수

### FR-04: 프론트엔드 ActivityLog.vue 페이지

- 상단: 필터 바 (그룹 선택, 액션 타입 필터, 날짜 범위)
- 중단: 타임라인 형태 로그 리스트
  - 각 로그: [상태배지] [사용자명] [행동 설명] [대상명] [시간]
  - 하단 칩: 상세 정보 (관수 로그면 구역수/시간, 장비 제어면 switch 코드 등)
- 하단: 더보기 페이지네이션
- admin에게만 "그룹 전체" 필터 옵션 표시

### FR-05: 기존 코드에 활동 로그 기록 삽입

- 각 서비스에서 행동 발생 시 `ActivityLogService.log()` 호출:
  - `DevicesService`: register, delete, control
  - `AutomationService`: create, update, enable/disable, delete
  - `AutomationRunnerService`: execute (기존 automation_logs 대체 또는 병행)
  - `IrrigationSchedulerService`: start, complete, cancel
  - `GroupsService`: create, update
  - `SensorsService`: sync
  - `EnvConfigService`: update

### FR-06: 자동화 페이지 실행 로그 탭 정리

- 자동화 페이지의 "실행 로그" 탭 제거 또는 "활동 로그 페이지에서 확인" 링크로 대체
- 대시보드 관수 현황 위젯은 유지 (관수 전용 요약)

## 3. 범위 (Scope)

### In Scope
- activity_logs 테이블 + Entity + Service + Controller
- ActivityLog.vue 페이지 + 라우터 + 사이드바 메뉴
- 주요 서비스에 로그 기록 삽입 (FR-05 목록)
- RBAC 기반 필터링 (admin 전체 / 일반 자기 그룹)
- 양 프로젝트 동시 반영

### Out of Scope
- 로그 보관/삭제 정책 (추후)
- 로그 내보내기 (CSV/Excel) (추후)
- 실시간 WebSocket 로그 스트리밍 (추후)
- 알림 연동 (추후)

## 4. 구현 순서

1. **FR-02**: activity_logs 테이블 + Entity + ActivityLogService
2. **FR-03**: API 엔드포인트 (Controller)
3. **FR-05**: 기존 서비스에 로그 기록 삽입 (가장 큰 작업)
4. **FR-01 + FR-04**: 프론트엔드 페이지 + 사이드바 메뉴
5. **FR-06**: 자동화 페이지 실행 로그 탭 정리
6. DB 마이그레이션 SQL 작성

## 5. 영향 범위

| 레이어 | 파일 | 변경 |
|--------|------|------|
| DB | `migrations/xxx_create_activity_logs.sql` | 새 테이블 |
| Backend | `modules/activity-log/` | 새 모듈 (entity, service, controller) |
| Backend | `modules/devices/devices.service.ts` | 로그 삽입 |
| Backend | `modules/automation/automation.service.ts` | 로그 삽입 |
| Backend | `modules/automation/automation-runner.service.ts` | 로그 삽입 |
| Backend | `modules/automation/irrigation-scheduler.service.ts` | 로그 삽입 |
| Backend | `modules/groups/groups.service.ts` | 로그 삽입 |
| Frontend | `views/ActivityLog.vue` | 새 페이지 |
| Frontend | `api/activity-log.api.ts` | 새 API 클라이언트 |
| Frontend | `components/common/BottomTabBar.vue` | 메뉴 추가 |
| Frontend | `App.vue` | 사이드바 메뉴 추가 |
| Frontend | `router/index.ts` | 라우트 추가 |

## 6. 리스크

- 로그 삽입 포인트가 많아 누락 가능성 → 체크리스트로 관리
- 로그 테이블 용량 증가 → 인덱스 설계 중요 (user_id, group_id, created_at, action)
- 기존 automation_logs와의 관계 → 병행 유지 (대시보드 관수 위젯은 기존 테이블 사용)
- 성능: 매 장비 제어마다 INSERT → async/non-blocking으로 처리

## 7. 대시보드 관수 위젯 요약 미표시 버그

### 원인
백엔드 코드는 수정 완료(deviceName, irrigationMin, fertilizerMin 등 추가)되었으나, **프로덕션 서버에 아직 재배포되지 않음**. 재배포 전에 기록된 로그에는 새 필드가 없어 칩이 표시되지 않음.

### 해결
1. 프로덕션 재배포 → 이후 관수 로그부터 요약 칩 정상 표시
2. 기존 로그는 startTime 칩만 표시 (정상 동작 — 데이터 없으면 칩 숨김)
