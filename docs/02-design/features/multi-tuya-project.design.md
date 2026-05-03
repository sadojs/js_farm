# Design: multi-tuya-project

## 1. 개요

유저당 Tuya API 프로젝트를 복수 등록하고, 장치마다 소속 프로젝트를 지정하여
Tuya Free 티어 10개 제어 한도를 우회한다.

---

## 2. 현재 아키텍처 (As-Is)

```
User (1) ──@OneToOne── TuyaProject
                        user_id UNIQUE
                        accessId / accessSecretEncrypted / endpoint

Device ──── userId
            (TuyaProject 조회 시 항상 userId 기준 단일 프로젝트)
```

**자격증명 조회 패턴 (4개 서비스 동일)**:
```ts
const project = await tuyaRepo.findOne({ where: { userId } });
```

---

## 3. 목표 아키텍처 (To-Be)

```
User (1) ──@ManyToOne── TuyaProject[]
                         user_id (NOT UNIQUE)
                         label (표시명)
                         accessId / accessSecretEncrypted / endpoint

Device ──── tuyaProjectId (FK → tuya_projects.id, nullable)
             ↳ null → userId 기준 createdAt ASC 첫 번째 프로젝트 폴백
```

---

## 4. DB 스키마 변경

### 마이그레이션 파일: `012_multi_tuya_project.sql`

```sql
-- 1. tuya_projects: UNIQUE 제약 제거, label 컬럼 추가
ALTER TABLE tuya_projects
  DROP CONSTRAINT IF EXISTS tuya_projects_user_id_key;

ALTER TABLE tuya_projects
  ADD COLUMN IF NOT EXISTS label VARCHAR(100);

-- 기존 레코드 label 기본값 채우기
UPDATE tuya_projects SET label = name WHERE label IS NULL;

-- 2. devices: tuya_project_id FK 추가
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS tuya_project_id UUID
    REFERENCES tuya_projects(id) ON DELETE SET NULL;
```

---

## 5. 백엔드 설계

### 5-1. Entity 수정

#### `tuya-project.entity.ts`
```ts
// Before
@OneToOne(() => User)
@JoinColumn({ name: 'user_id' })
user: User;

// After
@ManyToOne(() => User)
@JoinColumn({ name: 'user_id' })
user: User;

// 추가
@Column({ nullable: true })
label: string;
```

#### `device.entity.ts`
```ts
// 추가
@Column({ name: 'tuya_project_id', nullable: true })
tuyaProjectId: string | null;
```

---

### 5-2. 자격증명 조회 헬퍼 (공통 추출)

**`devices.service.ts`** 내부 헬퍼:
```ts
private async resolveCredentials(device: Device): Promise<TuyaCredentials> {
  let project: TuyaProject | null = null;

  if (device.tuyaProjectId) {
    project = await this.tuyaProjectRepo.findOne({
      where: { id: device.tuyaProjectId },
    });
  }
  if (!project) {
    project = await this.tuyaProjectRepo.findOne({
      where: { userId: device.userId },
      order: { createdAt: 'ASC' },
    });
  }
  if (!project) throw new NotFoundException('Tuya 프로젝트 설정이 없습니다.');

  return {
    accessId: project.accessId,
    accessSecret: this.decryptSecret(project.accessSecretEncrypted),
    endpoint: project.endpoint,
  };
}
```

**기존 패턴 교체**:
```ts
// Before (4곳)
const tuyaProject = await this.tuyaProjectRepo.findOne({ where: { userId } });
const credentials = { accessId: tuyaProject.accessId, ... };

// After
const credentials = await this.resolveCredentials(device);
```

---

### 5-3. SensorCollectorService 수정

기존: `userId` 기준 단일 프로젝트 조회 후 전체 센서 수집
변경: 센서별 `tuyaProjectId` 기준 조회 (폴백 포함)

```ts
// sensor-collector.service.ts
// collectSensors() 내부 패턴 변경:

// Before
const project = await this.tuyaProjectRepo.findOne({
  where: { userId, enabled: true },
});

// After
for (const sensor of sensors) {
  const project = sensor.tuyaProjectId
    ? await this.tuyaProjectRepo.findOne({ where: { id: sensor.tuyaProjectId } })
    : await this.tuyaProjectRepo.findOne({ where: { userId, enabled: true }, order: { createdAt: 'ASC' } });
  ...
}
```

> **참고**: Sensor 엔티티도 `tuyaProjectId` 추가 필요. 단, 센서는 장치를 통해 간접 연결되므로,
> 단기적으로는 센서가 속한 `Device`의 `tuyaProjectId`를 따르는 방식으로 구현 가능.
> 설계 단순화: `Sensor`에 직접 `tuyaProjectId` 추가하지 않고 `Device` 경유.

---

### 5-4. AutomationRunnerService / IrrigationSchedulerService 수정

```ts
// Before
const credentials = await this.tuyaRepo.findOne({ where: { userId } });

// After — device에서 tuyaProjectId 로드 후 resolveCredentials 패턴 사용
const device = await this.devicesRepo.findOne({ where: { id: deviceId } });
const credentials = await this.resolveCredentials(device);
```

> `resolveCredentials`는 `DevicesService`에 위치하므로, 
> AutomationRunner / IrrigationScheduler에는 동일한 private 헬퍼를 각각 복제하거나
> **공통 유틸(`tuya-credentials.util.ts`)로 추출**하여 공유한다.

---

### 5-5. UsersService — 다중 프로젝트 CRUD

```ts
// 기존: updateTuyaProject (upsert)
// 유지: 하위 호환 (PUT /me/tuya → 첫 번째 프로젝트 upsert)

// 신규 메서드
listTuyaProjects(userId: string): Promise<TuyaProject[]>
addTuyaProject(userId: string, dto: CreateTuyaProjectDto): Promise<TuyaProject>
updateTuyaProjectById(userId: string, projectId: string, dto: UpdateTuyaProjectDto): Promise<TuyaProject>
deleteTuyaProject(userId: string, projectId: string): Promise<void>
```

---

### 5-6. UsersController — API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/users/me/tuya-projects` | 내 프로젝트 목록 |
| `POST` | `/users/me/tuya-projects` | 프로젝트 추가 |
| `PUT` | `/users/me/tuya-projects/:id` | 프로젝트 수정 |
| `DELETE` | `/users/me/tuya-projects/:id` | 프로젝트 삭제 |
| `PUT` | `/users/me/tuya` | 기존 API (하위 호환, 첫 프로젝트 upsert) |
| `GET` | `/:id/tuya-projects` | Admin: 특정 유저 프로젝트 목록 |
| `PUT` | `/:id/tuya-projects/:projectId` | Admin: 특정 유저 프로젝트 수정 |

**DTO**:
```ts
export class CreateTuyaProjectDto {
  label: string;          // 표시명 (예: "농장A 계정1")
  name: string;
  accessId: string;
  accessSecret: string;
  endpoint: string;
  projectId?: string;
}

export class UpdateTuyaProjectDto extends PartialType(CreateTuyaProjectDto) {
  enabled?: boolean;
}
```

---

### 5-7. DevicesService — registerBatch 수정

장치 등록 시 `tuyaProjectId` 전달:
```ts
async registerBatch(
  userId: string,
  devices: { tuyaDeviceId: string; name: string; ... }[],
  houseId?: string,
  tuyaProjectId?: string,   // 신규
)
```

---

### 5-8. Tuya 장치 목록 API 수정

```ts
// GET /devices/tuya/list?projectId=xxx
// projectId 없으면 기존처럼 첫 번째 프로젝트 사용

async getTuyaDevices(userId: string, projectId?: string): Promise<TuyaDeviceInfo[]>
```

---

## 6. 프론트엔드 설계

### 6-1. API 클라이언트 (`user.api.ts`)

```ts
export interface TuyaProject {
  id: string;
  label: string;
  name: string;
  accessId: string;
  endpoint: string;
  projectId?: string;
  enabled: boolean;
  createdAt: string;
}

export interface CreateTuyaProjectRequest {
  label: string;
  name: string;
  accessId: string;
  accessSecret: string;
  endpoint: string;
  projectId?: string;
}

// 신규 API 메서드
listMyTuyaProjects: () => apiClient.get<TuyaProject[]>('/users/me/tuya-projects'),
addMyTuyaProject: (data: CreateTuyaProjectRequest) =>
  apiClient.post<TuyaProject>('/users/me/tuya-projects', data),
updateMyTuyaProjectById: (id: string, data: Partial<CreateTuyaProjectRequest>) =>
  apiClient.put<TuyaProject>(`/users/me/tuya-projects/${id}`, data),
deleteMyTuyaProject: (id: string) =>
  apiClient.delete(`/users/me/tuya-projects/${id}`),
```

---

### 6-2. Tuya 프로젝트 설정 UI

**위치**: `UserManagement.vue` 또는 별도 설정 페이지 내 "Tuya 연동" 섹션

**레이아웃**:
```
Tuya 연동 설정
┌─────────────────────────────────────────┐
│ 농장A 계정1        acc123  [수정] [삭제] │
│ 농장A 계정2        acc456  [수정] [삭제] │
│                                         │
│          [+ 새 계정 추가]               │
└─────────────────────────────────────────┘
```

**추가/수정 폼** (기존 UpdateTuyaForm 재사용 + label 필드 추가):
```
표시명 *: [___농장A 계정1_____]
프로젝트명: [________________]
Access ID: [________________]
Access Secret: [____________]
엔드포인트: [▼ 중국 / 미국 / EU / 인도]
[연결 테스트] [저장]
```

---

### 6-3. 장치 등록 시 프로젝트 선택

**`/devices/tuya/list` 호출 전** 프로젝트 선택 드롭다운:

```
Tuya 계정 선택: [▼ 농장A 계정1 (acc123)]
                   농장A 계정2 (acc456)
[장치 목록 가져오기]
```

선택한 `projectId`로 `GET /devices/tuya/list?projectId=xxx` 호출 후
등록 시 `tuyaProjectId`를 함께 전송.

---

### 6-4. 장치 카드 — 프로젝트 표시 (미구현, 설계 철회)

> **철회 사유**: Tuya Cloud에서 프로젝트별 장치 목록을 가져오는 방향이므로,
> 앱에서 반대로 장치를 다른 프로젝트에 재배정하는 것은 Tuya Cloud에 반영되지 않아 의미 없음.
> 장치 등록 시 프로젝트 선택(6-3)으로 충분하며 이 기능은 구현하지 않는다.

---

### 6-5. 수정 필요 파일

| 파일 | 변경 내용 |
|------|-----------|
| `frontend/src/api/user.api.ts` | Tuya 프로젝트 다중 CRUD API 추가 |
| `frontend/src/api/device.api.ts` | `getTuyaDevices(projectId?)` 파라미터 추가, `registerBatch`에 `tuyaProjectId` 추가 |
| `frontend/src/types/device.types.ts` | `Device`에 `tuyaProjectId?: string` 추가 |
| `frontend/src/views/UserManagement.vue` (또는 설정뷰) | Tuya 프로젝트 다중 목록 + CRUD UI |
| `frontend/src/components/devices/RegisterDeviceModal.vue` (또는 해당 컴포넌트) | 프로젝트 선택 드롭다운 추가 |

---

## 7. 구현 순서 (Do Phase 체크리스트)

### Phase 1 — DB & Entity
- [ ] `backend/database/migrations/007_multi_tuya_project.sql` 작성 및 실행
- [ ] `tuya-project.entity.ts`: `@OneToOne` → `@ManyToOne`, `label` 추가
- [ ] `device.entity.ts`: `tuyaProjectId` 컬럼 추가

### Phase 2 — 자격증명 헬퍼 공통화
- [ ] `backend/src/modules/integrations/tuya/tuya-credentials.util.ts` 추출
  - `resolveCredentials(device, tuyaProjectRepo)` 공통 함수
- [ ] `devices.service.ts`: 기존 6개 `findOne({ where: { userId } })` → 헬퍼로 교체
- [ ] `sensor-collector.service.ts`: 헬퍼로 교체
- [ ] `automation-runner.service.ts`: 헬퍼로 교체
- [ ] `irrigation-scheduler.service.ts`: 헬퍼로 교체

### Phase 3 — 다중 프로젝트 CRUD API
- [ ] `users.service.ts`: `listTuyaProjects`, `addTuyaProject`, `updateTuyaProjectById`, `deleteTuyaProject`
- [ ] `users.controller.ts`: 신규 엔드포인트 등록
- [ ] `user.dto.ts`: `CreateTuyaProjectDto` 추가

### Phase 4 — 장치 등록 `tuyaProjectId` 연결
- [ ] `devices.service.ts registerBatch`: `tuyaProjectId` 파라미터 수용
- [ ] `devices.controller.ts`: `tuyaProjectId` 전달
- [ ] `GET /devices/tuya/list?projectId=` 파라미터 지원

### Phase 5 — 프론트엔드
- [ ] `user.api.ts`: 다중 프로젝트 API 메서드 추가
- [ ] `device.api.ts`: `projectId` 파라미터 추가
- [ ] `device.types.ts`: `tuyaProjectId` 필드 추가
- [ ] UserManagement.vue (또는 설정뷰): 다중 프로젝트 목록 UI
- [ ] 장치 등록 컴포넌트: 프로젝트 선택 드롭다운

---

## 8. 하위 호환 전략

| 상황 | 동작 |
|------|------|
| 기존 장치 (`tuyaProjectId = null`) | `userId` 기준 `createdAt ASC` 첫 번째 프로젝트 자동 사용 |
| 기존 `PUT /users/me/tuya` API | 프로젝트가 없으면 생성, 있으면 첫 번째 프로젝트 업데이트 (기존 동작 유지) |
| 프로젝트 1개인 유저 | 동작 변화 없음 |
| 프로젝트 삭제 시 | `devices.tuya_project_id → SET NULL` (ON DELETE SET NULL) → 폴백 적용 |

---

## 9. 완료 기준 (DoD)

- [ ] 동일 유저로 Tuya 프로젝트 2개 이상 등록 가능
- [ ] 장치 등록 시 소속 프로젝트 지정 가능
- [ ] 장치 제어 시 해당 장치의 프로젝트 자격증명 사용 확인
- [ ] 기존 단일 프로젝트 유저 동작 유지 (하위 호환 검증)
- [ ] 프론트엔드 프로젝트 추가/수정/삭제 정상 동작
