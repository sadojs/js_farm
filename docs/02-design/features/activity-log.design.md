# activity-log Design

> 활동 로그 페이지 — 실행 로그 + 행동 로그 통합, 사이드바 독립 메뉴

## 1. 페이지 구조

### ActivityLog.vue — 2탭 구조

```
┌─────────────────────────────────────────────┐
│ 활동 로그                                     │
├──────────────┬──────────────────────────────┤
│ [실행 로그]   │  [행동 로그]                    │
├──────────────┴──────────────────────────────┤
│ 필터: [그룹 선택 ▼] [날짜 범위]               │
├─────────────────────────────────────────────┤
│ 실행 로그 탭:                                 │
│  [완료] 석문리 관수        방금                │
│    관수 TEST  19:10  2/4구역  관수 6분         │
│  [실행] 육묘장 팬 ON       5분 전              │
│    육묘장 휀  switch_1=true                   │
│  ...                                        │
│                                              │
│ 행동 로그 탭:                                 │
│  [제어] 홍길동 — 관수 TEST 수동 OFF  10분 전   │
│  [활성화] 홍길동 — 석문리 관수 룰 활성화  1시간 전 │
│  [등록] 관리자 — 센서 장비 등록  2시간 전       │
│  ...                                        │
├─────────────────────────────────────────────┤
│              [ 더보기 ]                       │
└─────────────────────────────────────────────┘
```

- **실행 로그 탭**: 기존 `automation_logs` 데이터 (자동화 실행 결과 — 관수/팬/개폐기 등)
- **행동 로그 탭**: 새 `activity_logs` 데이터 (사용자 행동 — 제어/설정변경/등록/삭제)

## 2. 백엔드

### 2.1 새 테이블: activity_logs

```sql
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  user_name VARCHAR(100) NOT NULL,
  group_id UUID REFERENCES house_groups(id),
  group_name VARCHAR(100),
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id VARCHAR(100),
  target_name VARCHAR(200),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user ON activity_logs(user_id, created_at DESC);
CREATE INDEX idx_activity_logs_group ON activity_logs(group_id, created_at DESC);
CREATE INDEX idx_activity_logs_action ON activity_logs(action, created_at DESC);
```

### 2.2 Entity: ActivityLog

**파일**: `backend/src/modules/activity-log/entities/activity-log.entity.ts`

```typescript
@Entity('activity_logs')
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'user_name' })
  userName: string;

  @Column({ name: 'group_id', nullable: true })
  groupId: string;

  @Column({ name: 'group_name', nullable: true })
  groupName: string;

  @Column()
  action: string;

  @Column({ name: 'target_type' })
  targetType: string;

  @Column({ name: 'target_id', nullable: true })
  targetId: string;

  @Column({ name: 'target_name', nullable: true })
  targetName: string;

  @Column({ type: 'jsonb', nullable: true })
  details: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

### 2.3 Service: ActivityLogService

**파일**: `backend/src/modules/activity-log/activity-log.service.ts`

```typescript
@Injectable()
export class ActivityLogService {
  constructor(
    @InjectRepository(ActivityLog) private repo: Repository<ActivityLog>,
  ) {}

  /** 로그 기록 (async, non-blocking) */
  async log(params: {
    userId: string;
    userName: string;
    groupId?: string;
    groupName?: string;
    action: string;
    targetType: string;
    targetId?: string;
    targetName?: string;
    details?: any;
  }) {
    try {
      await this.repo.save(this.repo.create(params));
    } catch (err) {
      // 로그 실패가 본 기능을 방해하면 안 됨
      Logger.warn(`활동 로그 기록 실패: ${err.message}`);
    }
  }

  /** 로그 목록 조회 */
  async findAll(params: {
    userId: string;
    isAdmin: boolean;
    groupId?: string;
    action?: string;
    targetType?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));

    const qb = this.repo.createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // RBAC: admin은 전체, 일반은 자기 그룹만
    if (!params.isAdmin) {
      qb.andWhere('a.user_id = :userId', { userId: params.userId });
    }
    if (params.groupId) {
      qb.andWhere('a.group_id = :groupId', { groupId: params.groupId });
    }
    if (params.action) {
      qb.andWhere('a.action = :action', { action: params.action });
    }
    if (params.targetType) {
      qb.andWhere('a.target_type = :targetType', { targetType: params.targetType });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
```

### 2.4 Controller: ActivityLogController

**파일**: `backend/src/modules/activity-log/activity-log.controller.ts`

```typescript
@Controller('activity-logs')
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(private readonly service: ActivityLogService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('groupId') groupId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      userId: user.sub || user.id,
      isAdmin: user.role === 'admin',
      groupId,
      action,
      targetType,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
```

### 2.5 행동 타입 목록

| action | 한글 | target_type | details 예시 |
|--------|------|-------------|-------------|
| `device.control` | 장비 제어 | device | `{ command: 'on', switchCode: 'switch_1' }` |
| `device.register` | 장비 등록 | device | `{ category: 'cz' }` |
| `device.delete` | 장비 삭제 | device | - |
| `rule.create` | 룰 생성 | rule | `{ ruleType: 'time' }` |
| `rule.update` | 룰 수정 | rule | - |
| `rule.enable` | 룰 활성화 | rule | - |
| `rule.disable` | 룰 비활성화 | rule | - |
| `rule.delete` | 룰 삭제 | rule | - |
| `group.create` | 그룹 생성 | group | - |
| `group.update` | 그룹 수정 | group | - |
| `env.update` | 환경설정 변경 | env_config | `{ field: 'temperature', value: 25 }` |

### 2.6 기존 서비스에 로그 삽입 위치

| 서비스 | 메서드 | action |
|--------|--------|--------|
| `DevicesService` | `controlDevice()` | `device.control` |
| `DevicesService` | `registerDevice()` | `device.register` |
| `DevicesService` | `deleteDevice()` | `device.delete` |
| `AutomationService` | `createRule()` | `rule.create` |
| `AutomationService` | `updateRule()` | `rule.update` |
| `AutomationService` | `toggleRule()` (enable) | `rule.enable` |
| `AutomationService` | `toggleRule()` (disable) | `rule.disable` |
| `AutomationService` | `deleteRule()` | `rule.delete` |
| `GroupsService` | `create()` | `group.create` |
| `GroupsService` | `update()` | `group.update` |

**주의**: 각 삽입 시 `user` 정보(id, name)와 `group` 정보가 필요 → 컨트롤러에서 서비스로 user 정보를 전달하는 구조 확인 필요.

## 3. 프론트엔드

### 3.1 API: activity-log.api.ts

```typescript
export interface ActivityLogEntry {
  id: string
  userId: string
  userName: string
  groupId: string | null
  groupName: string | null
  action: string
  targetType: string
  targetId: string | null
  targetName: string | null
  details: Record<string, any> | null
  createdAt: string
}

export const activityLogApi = {
  getLogs(params?: {
    groupId?: string; action?: string; targetType?: string;
    page?: number; limit?: number
  }): Promise<{ data: ActivityLogEntry[]; total: number }>,
}
```

### 3.2 라우터 추가

```typescript
{
  path: '/activity-log',
  name: 'activity-log',
  component: () => import('../views/ActivityLog.vue'),
}
```

### 3.3 사이드바 메뉴 (App.vue)

센서 알림 아래, 사용자 관리 위에 추가:
```html
<router-link to="/activity-log" class="sidebar-link">
  <span class="link-icon"><!-- 시계 SVG --></span>
  <span>활동 로그</span>
</router-link>
```
- **모든 역할** 접근 가능 (`v-if` 조건 없음)

### 3.4 ActivityLog.vue 구조

```html
<template>
  <div class="page-container">
    <div class="page-header">
      <h2>활동 로그</h2>
    </div>

    <!-- 탭 -->
    <div class="log-tabs">
      <button :class="{ active: tab === 'execution' }" @click="tab = 'execution'">
        실행 로그
      </button>
      <button :class="{ active: tab === 'activity' }" @click="tab = 'activity'">
        행동 로그
      </button>
    </div>

    <!-- 필터 -->
    <div class="filter-bar">
      <select v-model="selectedGroupId">
        <option value="">전체 그룹</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
    </div>

    <!-- 실행 로그 (기존 automation_logs) -->
    <div v-if="tab === 'execution'">
      <!-- AutomationLogTimeline과 동일한 UI -->
    </div>

    <!-- 행동 로그 (새 activity_logs) -->
    <div v-if="tab === 'activity'">
      <div v-for="log in activityLogs" :key="log.id" class="log-entry">
        <div class="log-main">
          <span class="log-status" :class="getActionClass(log.action)">
            {{ getActionLabel(log.action) }}
          </span>
          <span class="log-user">{{ log.userName }}</span>
          <span class="log-desc">{{ getActionDescription(log) }}</span>
          <span class="log-time">{{ formatTime(log.createdAt) }}</span>
        </div>
        <div class="log-summary">
          <span v-if="log.groupName" class="summary-chip">{{ log.groupName }}</span>
          <span v-if="log.targetName" class="summary-chip device">{{ log.targetName }}</span>
          <!-- details 기반 추가 칩 -->
        </div>
      </div>
    </div>
  </div>
</template>
```

### 3.5 행동 라벨/색상 매핑

```typescript
const ACTION_MAP: Record<string, { label: string; class: string }> = {
  'device.control': { label: '제어', class: 'control' },
  'device.register': { label: '등록', class: 'create' },
  'device.delete': { label: '삭제', class: 'delete' },
  'rule.create': { label: '생성', class: 'create' },
  'rule.update': { label: '수정', class: 'update' },
  'rule.enable': { label: '활성화', class: 'enable' },
  'rule.disable': { label: '비활성화', class: 'disable' },
  'rule.delete': { label: '삭제', class: 'delete' },
  'group.create': { label: '생성', class: 'create' },
  'group.update': { label: '수정', class: 'update' },
  'env.update': { label: '설정변경', class: 'update' },
}
```

| class | 배경 | 글자 |
|-------|------|------|
| control | #e3f2fd | #1565c0 (파랑) |
| create | #e8f5e9 | #2e7d32 (초록) |
| update | #fff3e0 | #e65100 (주황) |
| enable | #e8f5e9 | #2e7d32 (초록) |
| disable | #fce4ec | #c62828 (빨강) |
| delete | #ffebee | #c62828 (빨강) |

### 3.6 자동화 페이지 실행 로그 탭 정리

`Automation.vue`의 "실행 로그" 탭을 **"활동 로그에서 확인"** 링크로 대체:

```html
<!-- 기존 AutomationLogTimeline 자리 -->
<div class="log-redirect">
  <p>실행 로그가 활동 로그 페이지로 이동했습니다.</p>
  <router-link to="/activity-log" class="btn-link">활동 로그 보기</router-link>
</div>
```

## 4. 구현 순서

| 순서 | FR | 작업 | 파일 |
|:----:|:--:|------|------|
| 1 | FR-02 | DB 마이그레이션 SQL + Entity | `migrations/`, `activity-log.entity.ts` |
| 2 | FR-02 | ActivityLogService + Module | `activity-log.service.ts`, `activity-log.module.ts` |
| 3 | FR-03 | ActivityLogController | `activity-log.controller.ts` |
| 4 | FR-05 | 기존 서비스에 로그 삽입 (10곳) | devices, automation, groups |
| 5 | FR-01 | 라우터 + 사이드바 메뉴 추가 | `router/`, `App.vue`, `BottomTabBar.vue` |
| 6 | FR-04 | ActivityLog.vue (2탭 UI) | `views/ActivityLog.vue` |
| 7 | FR-04 | activity-log.api.ts | `api/activity-log.api.ts` |
| 8 | FR-06 | 자동화 페이지 실행 로그 탭 정리 | `Automation.vue` |
| 9 | - | 양 프로젝트 동기화 | smart-farm-mqtt 동일 반영 |

## 5. 양 프로젝트 차이점

| 항목 | platform | mqtt |
|------|----------|------|
| 장비 제어 서비스 | Tuya API | MQTT controlDevice |
| 사용자 관리 | users 테이블 | 동일 |
| activity_logs 스키마 | 동일 | 동일 |
| 프론트엔드 | CSS 변수 (font-size) | calc(px * scale) |
