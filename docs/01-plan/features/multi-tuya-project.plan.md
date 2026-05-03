# Plan: multi-tuya-project

## 기능 개요

Tuya Cloud 무료 티어는 계정당 제어 가능한 장치를 **10개**로 제한한다.
한 농장에서 그 이상의 장치를 운용하려면 여러 Tuya API 계정(프로젝트)을 등록하고,
장치마다 어느 계정으로 제어할지 연결할 수 있어야 한다.

현재는 유저 1명 = Tuya 프로젝트 1개(1:1)이므로, 이를 **1:N 다중 프로젝트**로 확장한다.

---

## 배경 및 동기

| 항목 | 현황 |
|------|------|
| Tuya Free 티어 등록 장치 한도 | 50개/계정 |
| Tuya Free 티어 **제어** 가능 장치 | **10개/계정** |
| 현재 아키텍처 | 유저당 TuyaProject 1개 (1:1) |
| 문제 | 농장 규모가 커지면 10개 제한으로 인해 일부 장치 제어 불가 |

---

## 목표 (Goal)

1. 유저 계정에 **복수의 Tuya API 프로젝트**를 등록할 수 있다.
2. 각 장치는 특정 Tuya 프로젝트에 **매핑**된다.
3. 장치 제어/상태조회 시 해당 장치의 Tuya 프로젝트 자격증명을 자동으로 사용한다.
4. 기존 장치(프로젝트 미매핑)는 **기존 단일 프로젝트로 자동 폴백**되어 하위 호환을 유지한다.
5. 프론트엔드에서 프로젝트 추가/수정/삭제 및 장치-프로젝트 매핑 변경 UI 제공.

---

## 범위 (Scope)

### In-scope
- `tuya_projects` 테이블 스키마 변경: `user_id` unique 제약 제거 → 1:N 허용
- `devices` 테이블: `tuya_project_id` 컬럼 추가 (nullable, FK)
- 백엔드 서비스 수정:
  - `DevicesService`: 제어/상태조회 시 장치의 `tuyaProjectId` 기준 자격증명 조회
  - `UsersService`: 프로젝트 CRUD (다중)
  - `SensorCollectorService` / `AutomationRunnerService` 등 Tuya 호출 경로 전체 반영
- 프론트엔드:
  - 설정 > Tuya 연동 UI: 복수 프로젝트 목록 표시 + 추가/수정/삭제
  - 장치 등록/편집 시 소속 Tuya 프로젝트 선택 드롭다운

### Out-of-scope
- Tuya 계정 자동 생성/대리 등록
- 프로젝트 간 장치 자동 분산(로드밸런싱)
- smart-farm-mqtt 프로젝트 동기화 (별도 진행)

---

## 현재 아키텍처

```
User (1) ──── (1) TuyaProject
                    accessId
                    accessSecretEncrypted
                    endpoint

Device ──── userId (User 기준으로 TuyaProject 간접 조회)
```

`devices.service.ts` 패턴:
```ts
const tuyaProject = await this.tuyaProjectRepo.findOne({ where: { userId } });
// 항상 유저당 1개만 반환
```

---

## 목표 아키텍처

```
User (1) ──── (N) TuyaProject  [unique 제약 제거, 복수 등록 허용]
                    accessId
                    accessSecretEncrypted
                    endpoint
                    label (표시명, 신규)

Device ──── tuyaProjectId (FK → TuyaProject, nullable)
             ↳ null이면 userId 기준 첫 번째(기본) 프로젝트로 폴백
```

`devices.service.ts` 신규 패턴:
```ts
// 장치의 tuyaProjectId가 있으면 직접 조회, 없으면 userId 기준 기본 프로젝트
const tuyaProject = device.tuyaProjectId
  ? await this.tuyaProjectRepo.findOne({ where: { id: device.tuyaProjectId } })
  : await this.tuyaProjectRepo.findOne({ where: { userId }, order: { createdAt: 'ASC' } });
```

---

## 영향 범위 분석

### 백엔드
| 파일 | 변경 유형 |
|------|-----------|
| `tuya-project.entity.ts` | `@OneToOne` → `@ManyToOne`(User), `label` 컬럼 추가 |
| `device.entity.ts` | `tuyaProjectId` 컬럼 추가 (nullable FK) |
| `devices.service.ts` | 자격증명 조회 로직 수정 (6개 메서드) |
| `users.service.ts` | 프로젝트 CRUD: 단일→다중 (add/update/delete/list) |
| `users.controller.ts` | 프로젝트 API 엔드포인트 확장 |
| `user.dto.ts` | 프로젝트 관련 DTO 수정 |
| `sensor-collector.service.ts` | Tuya 자격증명 조회 경로 수정 |
| `automation-runner.service.ts` | Tuya 자격증명 조회 경로 수정 |
| `irrigation-scheduler.service.ts` | Tuya 자격증명 조회 경로 수정 |
| DB migration | `ALTER TABLE` × 2 (tuya_projects, devices) |

### 프론트엔드
| 파일 | 변경 유형 |
|------|-----------|
| `UserManagement.vue` 또는 설정 뷰 | Tuya 프로젝트 다중 등록 UI |
| 장치 등록/편집 컴포넌트 | 소속 프로젝트 선택 드롭다운 |
| `device.types.ts` | `tuyaProjectId` 필드 추가 |
| API 클라이언트 | 프로젝트 CRUD API 호출 |

---

## DB 마이그레이션 계획

```sql
-- 1. tuya_projects: unique 제약 제거, label 컬럼 추가
ALTER TABLE tuya_projects
  DROP CONSTRAINT IF EXISTS tuya_projects_user_id_key,
  ADD COLUMN IF NOT EXISTS label VARCHAR(100);

-- 2. devices: tuya_project_id FK 추가
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS tuya_project_id UUID REFERENCES tuya_projects(id) ON DELETE SET NULL;
```

---

## 하위 호환 전략

- 기존 `devices.tuya_project_id = NULL` 장치 → `userId` 기준 가장 오래된(첫 번째) 프로젝트 자동 사용
- 프로젝트 1개만 있는 기존 유저는 동작 변화 없음
- 프로젝트 추가 시 기존 장치의 `tuyaProjectId`는 null 유지 (자동 폴백)

---

## 우선순위 및 구현 순서

1. **DB 마이그레이션** (기반)
2. **Entity 수정** (`TuyaProject`, `Device`)
3. **백엔드 서비스** — 자격증명 조회 헬퍼 추출 후 일괄 교체
4. **API 확장** — 프로젝트 다중 CRUD
5. **프론트엔드** — 설정 UI + 장치 매핑 UI

---

## 완료 기준 (DoD)

- [ ] 동일 유저로 Tuya 프로젝트 2개 이상 등록 가능
- [ ] 장치마다 소속 프로젝트 지정 가능
- [ ] 장치 제어 시 올바른 프로젝트 자격증명으로 Tuya API 호출
- [ ] 기존 장치(프로젝트 미지정) 정상 동작 (하위 호환)
- [ ] 프론트엔드에서 프로젝트 추가/삭제 및 장치-프로젝트 매핑 변경 가능
