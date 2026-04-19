# Design: 적산온도 기반 생육관리 (GDD Crop Management)

**Feature ID**: growing-degree-days  
**작성일**: 2026-04-12  
**Phase**: Design  
**Plan 참조**: `docs/01-plan/features/growing-degree-days.plan.md`

---

## 0. 독립성 원칙 (Isolation-First Design)

> **이 모듈은 언제든 안전하게 삭제 가능하도록 설계한다.**

### 삭제 체크리스트 (완전 제거 시)

```
Backend:
  [ ] rm -rf backend/src/modules/crop-management/
  [ ] app.module.ts 에서 CropManagementModule import 1줄 제거

Frontend:
  [ ] rm -rf frontend/src/modules/crop-management/
  [ ] router/index.ts 에서 /crop-management 라우트 1줄 제거
  [ ] App.vue 에서 sidebar link 1줄 제거
  [ ] Dashboard.vue 에서 widget v-else-if 1줄 제거 + import 1줄 제거

DB:
  [ ] DROP TABLE gdd_batches CASCADE;
  [ ] DROP TABLE crop_milestones CASCADE;
```

### 독립성 보장 규칙
- **기존 모듈을 import하지 않는다** — 단, Auth JWT Guard 제외 (보안 필수)
- **기존 테이블에 컬럼/FK를 추가하지 않는다** — `user_id`는 UUID 문자열로만 참조
- **`group_id`는 소프트 참조** — ON DELETE CASCADE 없이 UUID 문자열로만 저장
- **대시보드 위젯은 optional** — 없어도 대시보드 정상 동작
- **사이드바 링크 1줄** — App.vue 변경 최소화

---

## 1. 아키텍처 구조

```
backend/src/modules/crop-management/          ← 독립 NestJS 모듈
  crop-management.module.ts
  crop-management.controller.ts
  gdd.service.ts                              ← 적산온도 계산 핵심
  crop-batch.service.ts                       ← CRUD
  entities/
    crop-batch.entity.ts
    crop-milestone.entity.ts
  dto/
    create-crop-batch.dto.ts
    update-crop-batch.dto.ts
  seeds/
    (제거됨) crop-milestones.seed.ts          ← 마스터 데이터는 SQL 마이그레이션으로 통합

frontend/src/modules/crop-management/         ← 독립 프론트 모듈
  CropManagementView.vue                      ← 메인 페이지
  CropBatchModal.vue                          ← 파종 정보 입력 모달
  GddDashboardWidget.vue                      ← 대시보드용 위젯 (optional)
  composables/
    useCropBatch.ts                           ← API 호출 + 상태관리
    useCropFeature.ts                         ← 기능 ON/OFF 상태관리
  utils/
    growth-stage.ts                           ← 프론트 GDD 유틸 (생육단계 계산, 배지 등)
  api/
    crop-management.api.ts                    ← Axios 클라이언트 (독립)
  types/
    crop-management.types.ts
```

---

## 2. 온도 소스 전략 (Temperature Source Strategy)

> 실내 센서가 없는 농장을 위한 핵심 설계

### 2-1. 문제 정의

| 상황 | 정확도 | 설명 |
|------|--------|------|
| 실내 센서 O | ⭐⭐⭐ 높음 | 하우스 실제 온도 → 가장 정확 |
| 실내 센서 X + 보정값 O | ⭐⭐ 중간 | 기상청 온도 + 온실 보정 오프셋 |
| 실내 센서 X + 보정값 X | ⭐ 낮음 | 기상청 외기온도만 사용 |

### 2-2. 온도 소스 우선순위 로직

```
resolveTemperatureSource(batch):
  1. 그룹에 연결된 장치 목록 조회 (group_devices)
  2. 해당 장치들의 sensor_data WHERE sensor_type = 'temperature' 존재 여부 확인
     + 최근 24시간 내 데이터가 있는지 확인 (활성 센서 판단)
  3. 활성 실내 센서 있음 → SOURCE: 'sensor'  (실내 온도 직접 사용)
  4. 활성 실내 센서 없음 → SOURCE: 'weather'
     4a. greenhouse_offset이 설정됨 → 기상청 온도 + offset 적용
     4b. greenhouse_offset 없음    → 기상청 온도 그대로 + ⚠️ 낮은 정확도 경고
```

### 2-3. env_mappings 활용 (기존 인프라 재사용)

`env_mappings` 테이블이 이미 그룹별 `internal_temp` → 센서 매핑을 관리한다.

```sql
-- 그룹의 실내 온도 센서 장치 ID 조회 (env_mappings 활용)
SELECT device_id, sensor_type
FROM env_mappings
WHERE group_id = :groupId
  AND role_key = 'internal_temp'
  AND source_type = 'sensor'
  AND device_id IS NOT NULL
LIMIT 1;
```

---

### 2-4. 다른 농장 오프셋 차용 (Cross-Group Offset Borrowing)

실내 센서 없는 농장을 위한 오프셋 차용 전략:

#### 차용 우선순위

```
1. 자체 보정값 (자동 계산)                     → 최우선
2. 수동 지정 오프셋                             → 2순위
3. 같은 사용자의 다른 그룹에서 차용             → 3순위
4. 플랫폼 작물별 중앙값 (익명 집계, 커뮤니티)  → 4순위
5. 오프셋 없음 (기상청만)                       → 최하위
```

#### 플랫폼 커뮤니티 오프셋 테이블

```sql
CREATE TABLE crop_community_offsets (
  crop_type     VARCHAR(30) PRIMARY KEY,
  median_offset DECIMAL(4,1),
  sample_count  INT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
-- 매일 새벽 크론으로 갱신 (개인정보 없이 수치만 집계)
```

#### gdd_batches 추가 필드

```
offset_source       VARCHAR(20)  -- calibrated | manual | borrowed | community
borrowed_group_id   UUID         -- 차용한 그룹 ID (소프트 참조, FK 없음)
```

#### API: 오프셋 후보 조회

```
GET /api/crop-management/offset-suggestions?groupId={id}

{
  "selfCalibrated": null,
  "otherGroups": [
    { "groupId": "uuid", "groupName": "1동", "offset": 4.2, "cropType": "tomato" }
  ],
  "communityAverage": { "cropType": "tomato", "offset": 3.8, "sampleCount": 47 }
}
```

---

### 2-5. 자동 보정값 계산 (Auto-Calibration)

**실내 센서가 있으면 자동으로 오프셋 학습:**

```sql
-- 같은 시간대 실내 센서 평균과 기상청 온도의 차이를 계산
-- 이 값을 greenhouse_offset에 저장 → 센서 없어졌을 때 fallback으로 사용
SELECT AVG(s.indoor_avg - w.temperature) AS offset
FROM (
  SELECT time_bucket('1 hour', sd.time) AS hour, AVG(sd.value) AS indoor_avg
  FROM sensor_data sd
  JOIN group_devices gd ON sd.device_id = gd.device_id
  WHERE gd.group_id = :groupId
    AND sd.sensor_type = 'temperature'
    AND sd.time >= NOW() - INTERVAL '30 days'
  GROUP BY 1
) s
JOIN weather_data w ON w.time = s.hour AND w.user_id = :userId
```

→ 30일치 데이터 기반으로 **일평균 실내외 온도 차이를 자동 계산해 저장**  
→ 이후 센서 고장/분리 시 `기상청 + offset`으로 자동 fallback

### 2-4. 데이터 갭 처리 (Gap Fill)

실내 센서가 있어도 통신 오류 등으로 일부 시간 데이터가 빠질 수 있음:

```
일별 GDD 계산 시:
  - 해당 날 실내 센서 데이터 N시간 이상 있음  → 센서 데이터 우선
  - 해당 날 실내 센서 데이터 N시간 미만 (갭) → 기상청 + offset으로 보완
  - N = 12시간 (하루의 50% 이상 데이터 있으면 신뢰)
```

### 2-5. UI 데이터 품질 배지

GDD 수치 옆에 소스 뱃지를 표시해 농부가 신뢰도를 직관적으로 파악:

```
🟢 실내 센서     — 실내 온도 기준, 높은 정확도
🟡 센서 + 보정   — 실내 센서 + 일부 기상청 보완
🟠 기상청 + 보정값  — 기상청 온도 + 온실 보정값 적용
🔴 기상청만 사용  — ⚠️ 정확도 낮음. 실내 센서 설치를 권장합니다
```

> **구현 참고**: `weather_only` 배지는 실제로 거의 표시되지 않습니다.
> 실내 센서가 없고 사용자 지정 오프셋도 없는 경우, `DEFAULT_GREENHOUSE_OFFSET = 8.0°C`가
> 자동으로 적용되므로 사실상 항상 `weather_with_offset` 상태가 됩니다.
> `weather_only`는 명시적으로 `temp_source = 'weather'`로 강제 설정한 경우에만 발생합니다.

---

## 3. DB 스키마

### 3-1. `gdd_batches` (신규)

> **참고**: 테이블명은 설계 초안의 `crop_batches`에서 `gdd_batches`로 변경되었습니다.
> 모듈 접두어(`crop_`)가 다른 crop 관련 테이블과 혼동될 수 있어 GDD 모듈 전용임을 명확히 하는 `gdd_` 접두어를 사용합니다.

```sql
CREATE TABLE gdd_batches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL,           -- 소프트 참조 (FK 없음)
  group_id            UUID,                    -- 소프트 참조 (FK 없음)
  crop_type           VARCHAR(30) NOT NULL,    -- 작물 종류 (enum: 아래 참조)
  seedling_type       VARCHAR(20) NOT NULL,    -- 묘 타입: seedling | grafted
  sowing_date         DATE NOT NULL,           -- 파종일
  transplant_date     DATE,                    -- 정식일 (null 허용)
  base_temp           DECIMAL(4,1) NOT NULL DEFAULT 10.0,  -- 기준온도 (°C)
  target_gdd          DECIMAL(7,1),            -- 수확 목표 GDD
  -- 온도 소스 관련
  temp_source         VARCHAR(20) NOT NULL DEFAULT 'auto',
                      -- auto: 자동 선택 | sensor: 실내 센서 강제 | weather: 기상청 강제
  greenhouse_offset   DECIMAL(4,1),            -- 온실 보정값 (°C). null=미설정, 자동계산 후 저장
  offset_calibrated_at TIMESTAMPTZ,            -- 마지막 자동 보정 시각
  notes               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdd_batches_user_id ON gdd_batches(user_id);
CREATE INDEX idx_gdd_batches_group_id ON gdd_batches(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_gdd_batches_active ON gdd_batches(user_id, is_active);
```

**crop_type 허용값**: `tomato`, `cherry_tomato`, `cucumber`, `strawberry`, `paprika`  
**seedling_type 허용값**: `seedling`(실생묘), `grafted`(접목묘)  
**temp_source 허용값**: `auto`(기본), `sensor`(센서 강제), `weather`(기상청 강제)

---

### 2-2. `crop_milestones` (마스터 데이터, 신규)

```sql
CREATE TABLE crop_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_type       VARCHAR(30) NOT NULL,
  seedling_type   VARCHAR(20),             -- NULL이면 묘 타입 공통
  milestone_type  VARCHAR(30) NOT NULL,    -- pest_control | fertilizer | pruning | stage
  gdd_threshold   DECIMAL(7,1) NOT NULL,
  title           VARCHAR(100) NOT NULL,
  description     TEXT,
  priority        VARCHAR(10) NOT NULL DEFAULT 'normal',  -- high | normal | low
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crop_milestones_crop ON crop_milestones(crop_type, seedling_type);
```

**마스터 데이터 (SQL 마이그레이션으로 관리)**:

> **구현 변경**: 설계 초안의 `seeds/crop-milestones.seed.ts` 파일은 사용하지 않습니다.
> 마스터 데이터는 `backend/database/migrations/` 디렉토리의 SQL 마이그레이션 파일에 통합되어 있습니다.
> (migrations 009~011에서 토마토·방울토마토·오이·딸기·파프리카 마일스톤 INSERT 수행)

| crop_type | milestone_type | gdd_threshold | title | priority |
|-----------|---------------|---------------|-------|---------|
| tomato | stage | 80 | 발아 완료 | normal |
| tomato | stage | 200 | 육묘 완료 / 정식 적기 | high |
| tomato | pest_control | 200 | 1차 역병 방제 | high |
| tomato | fertilizer | 300 | 1차 칼슘 시비 (배꼽썩음 예방) | high |
| tomato | pest_control | 450 | 진딧물 방제 확인 | normal |
| tomato | stage | 600 | 개화착과기 진입 | normal |
| tomato | fertilizer | 600 | 칼리 증량 (과실 비대) | normal |
| tomato | pest_control | 700 | 2차 역병 방제 | high |
| tomato | pruning | 500 | 순따기 1회차 | normal |
| tomato | pruning | 700 | 순따기 2회차 | normal |
| tomato | stage | 1200 | 수확 시작 | high |

---

## 3. 백엔드 설계

### 3-1. 모듈 등록 (`app.module.ts` 변경 — 1줄만)

```typescript
// 추가할 라인 1개
import { CropManagementModule } from './modules/crop-management/crop-management.module';

// imports 배열에 추가
CropManagementModule,
```

### 3-2. `crop-management.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([GddBatch, CropMilestone]),
  ],
  controllers: [CropManagementController],
  providers: [CropBatchService, GddService],
  // exports 없음 — 다른 모듈이 의존하지 않도록
})
export class CropManagementModule {}
```

### 3-3. API 엔드포인트 (`/api/crop-management`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/crop-management/batches` | 내 활성 배치 목록 (group_id별) |
| POST | `/api/crop-management/batches` | 배치 생성 |
| PUT | `/api/crop-management/batches/:id` | 배치 수정 |
| DELETE | `/api/crop-management/batches/:id` | 배치 삭제 (soft: is_active=false) |
| GET | `/api/crop-management/batches/:id/gdd` | 배치의 현재 GDD + 단계 정보 |
| GET | `/api/crop-management/batches/:id/milestones` | 마일스톤 목록 + 완료 여부 |
| GET | `/api/crop-management/batches/:id/harvest-prediction` | 수확일 예측 |
| GET | `/api/crop-management/dashboard` | 대시보드용 요약 (그룹별) |
| GET | `/api/crop-management/milestones/master` | 마스터 마일스톤 조회 (crop_type별) |
| POST | `/api/crop-management/batches/:id/calibrate` | 온실 오프셋 수동 재보정 트리거 |
| GET | `/api/crop-management/batches/:id/timeline` | 일별 GDD 타임라인 + 미래 마일스톤 예상일 |
| GET | `/api/crop-management/offset-suggestions` | 오프셋 후보 조회 (자체/타그룹/커뮤니티) |

### 4-4. GDD 계산 서비스 (`gdd.service.ts`)

#### 온도 소스 결정 (resolveSource)

```typescript
type TempSource = 'sensor' | 'sensor_with_gap_fill' | 'weather_with_offset' | 'weather_only';

async resolveSource(batch: CropBatch): Promise<{ source: TempSource; offset: number }> {
  if (batch.tempSource === 'weather') return { source: 'weather_only', offset: 0 };

  // 그룹의 실내 온도 센서 활성 여부 확인
  if (batch.groupId) {
    const hasActiveSensor = await this.checkActiveSensor(batch.groupId);
    if (hasActiveSensor) {
      return { source: 'sensor', offset: 0 };
    }
  }

  // 실내 센서 없음 → weather fallback
  const offset = batch.greenhouseOffset ?? 0;
  return {
    source: offset !== 0 ? 'weather_with_offset' : 'weather_only',
    offset,
  };
}

// 최근 24시간 내 실내 온도 센서 데이터 존재 여부
private async checkActiveSensor(groupId: string): Promise<boolean> {
  const rows = await this.repo.query(`
    SELECT 1 FROM sensor_data sd
    JOIN group_devices gd ON sd.device_id = gd.device_id
    WHERE gd.group_id = $1
      AND sd.sensor_type = 'temperature'
      AND sd.time >= NOW() - INTERVAL '24 hours'
    LIMIT 1
  `, [groupId]);
  return rows.length > 0;
}
```

#### 핵심 GDD 계산 (calculateGdd)

```typescript
async calculateGdd(batch: CropBatch): Promise<{ totalGdd: number; source: TempSource; dataQuality: number }> {
  const { source, offset } = await this.resolveSource(batch);

  if (source === 'sensor' || source === 'sensor_with_gap_fill') {
    return this.calculateFromSensor(batch, offset);
  } else {
    return this.calculateFromWeather(batch, offset, source);
  }
}

// 실내 센서 기반 (갭은 weather+offset으로 보완)
private async calculateFromSensor(batch: CropBatch, offset: number) {
  const rows = await this.repo.query(`
    WITH daily_sensor AS (
      -- 일별 실내 센서 온도 (데이터 있는 시간 비율도 계산)
      SELECT
        time_bucket('1 day', sd.time)::date AS day,
        AVG(sd.value)                        AS indoor_avg,
        COUNT(*)                             AS hour_count
      FROM sensor_data sd
      JOIN group_devices gd ON sd.device_id = gd.device_id
      WHERE gd.group_id = $1
        AND sd.sensor_type = 'temperature'
        AND sd.time >= $2::date
        AND sd.time < NOW()
      GROUP BY 1
    ),
    daily_weather AS (
      -- 갭 보완용 기상청 데이터
      SELECT
        time_bucket('1 day', time)::date AS day,
        AVG(temperature) + $3            AS weather_adj
      FROM weather_data
      WHERE user_id = $4
        AND time >= $2::date
        AND time < NOW()
      GROUP BY 1
    ),
    daily_combined AS (
      -- 신뢰 데이터(12h+) → 센서, 갭 → weather+offset
      SELECT
        COALESCE(ds.day, dw.day) AS day,
        CASE
          WHEN ds.hour_count >= 12 THEN GREATEST(ds.indoor_avg - $5, 0)
          ELSE GREATEST(COALESCE(dw.weather_adj, 0) - $5, 0)
        END AS daily_gdd,
        CASE WHEN ds.hour_count >= 12 THEN 'sensor' ELSE 'gap_filled' END AS day_source
      FROM daily_sensor ds
      FULL OUTER JOIN daily_weather dw ON ds.day = dw.day
    )
    SELECT
      COALESCE(SUM(daily_gdd), 0)                                      AS total_gdd,
      COUNT(*) FILTER (WHERE day_source = 'sensor') * 100.0 / COUNT(*) AS sensor_ratio
    FROM daily_combined
  `, [batch.groupId, batch.sowingDate, offset, batch.userId, batch.baseTemp]);

  const sensorRatio = parseFloat(rows[0]?.sensor_ratio ?? '0');
  return {
    totalGdd: parseFloat(rows[0]?.total_gdd ?? '0'),
    source: sensorRatio >= 80 ? 'sensor' : 'sensor_with_gap_fill' as TempSource,
    dataQuality: Math.round(sensorRatio),  // 0~100
  };
}

// 기상청 기반 (offset 적용)
private async calculateFromWeather(batch: CropBatch, offset: number, source: TempSource) {
  const rows = await this.repo.query(`
    SELECT COALESCE(SUM(daily_gdd), 0) AS total_gdd
    FROM (
      SELECT GREATEST(AVG(temperature) + $1 - $2, 0) AS daily_gdd
      FROM weather_data
      WHERE user_id = $3
        AND time >= $4::date
        AND time < NOW()
      GROUP BY time_bucket('1 day', time)
    ) sub
  `, [offset, batch.baseTemp, batch.userId, batch.sowingDate]);
  return {
    totalGdd: parseFloat(rows[0]?.total_gdd ?? '0'),
    source,
    dataQuality: source === 'weather_with_offset' ? 60 : 30,
  };
}
```

#### 자동 보정값 계산 (autoCalibrate)

```typescript
// 자동 보정 트리거 시점:
//   1) 배치 생성 시 1회 (실내 센서 데이터가 충분한 경우)
//   2) 수동 트리거: POST /api/crop-management/batches/:id/calibrate
// (설계 변경) 주 1회 자동 Cron 방식은 채택하지 않음.
//   이유: 보정값이 자주 변경되면 GDD 누적값이 소급 변동되어 사용자 혼란 유발.
//   배치 생성 시 1회 + 필요 시 수동 재보정 방식이 안정적.
async autoCalibrate(batch: CropBatch): Promise<number | null> {
  if (!batch.groupId) return null;

  const rows = await this.repo.query(`
    SELECT AVG(s.indoor_avg - w.temperature) AS offset
    FROM (
      SELECT time_bucket('1 hour', sd.time) AS hour, AVG(sd.value) AS indoor_avg
      FROM sensor_data sd
      JOIN group_devices gd ON sd.device_id = gd.device_id
      WHERE gd.group_id = $1
        AND sd.sensor_type = 'temperature'
        AND sd.time >= NOW() - INTERVAL '30 days'
      GROUP BY 1
    ) s
    JOIN weather_data w ON w.time = s.hour AND w.user_id = $2
    WHERE w.temperature IS NOT NULL
  `, [batch.groupId, batch.userId]);

  const offset = parseFloat(rows[0]?.offset);
  if (!isNaN(offset) && isFinite(offset)) {
    // 계산된 오프셋 저장 (센서 없어져도 이 값으로 fallback)
    await this.batchRepo.update(batch.id, {
      greenhouseOffset: Math.round(offset * 10) / 10,  // 소수점 1자리
      offsetCalibratedAt: new Date(),
    });
    return offset;
  }
  return null;
}
```

### 3-5. 작물별 기본값 상수 (`crop-defaults.constants.ts`)

```typescript
export const CROP_DEFAULTS = {
  tomato:        { baseTemp: 10, targetGdd: 1200, label: '토마토' },
  cherry_tomato: { baseTemp: 10, targetGdd: 1100, label: '방울토마토' },
  cucumber:      { baseTemp: 12, targetGdd:  900, label: '오이' },
  strawberry:    { baseTemp:  5, targetGdd:  800, label: '딸기' },
  paprika:       { baseTemp: 10, targetGdd: 1400, label: '파프리카' },
} as const;

// 접목묘 기준온도 및 목표 GDD는 CROP_BASE_TEMP_GRAFTED / CROP_TARGET_GDD_GRAFTED 별도 상수로 관리
// (설계 변경) GRAFTED_STAGE_FACTOR(0.85 단일 비율) 방식은 채택하지 않음.
// 이유: 작물별 접목 효과의 편차가 크고, 마일스톤별로 다른 보정이 필요하기 때문.
// 대신 crop_milestones 테이블에 seedling_type 컬럼으로 접목묘 전용 마일스톤 행을 분리 저장.
```

---

## 4. 프론트엔드 설계

### 4-1. 라우터 추가 (`router/index.ts` — 1줄)

```typescript
{
  path: '/crop-management',
  name: 'CropManagement',
  component: () => import('../modules/crop-management/CropManagementView.vue'),
  meta: { requiresAuth: true },
},
```

### 4-2. 사이드바 링크 (`App.vue` — 1줄)

```html
<router-link to="/crop-management" class="sidebar-link">
  <span class="sidebar-icon">🌱</span>
  <span class="sidebar-label">생육관리</span>
</router-link>
```

### 4-3. 대시보드 위젯 (`Dashboard.vue` — 최소 변경)

```html
<!-- Dashboard.vue: 기존 widget 조건문에 1줄 추가 -->
<GddDashboardWidget v-else-if="widget.type === 'gdd'" />

<!-- import 1줄 추가 -->
<script>
import GddDashboardWidget from '../modules/crop-management/GddDashboardWidget.vue'
</script>
```

> 위젯은 Dashboard의 `layout` 배열에 `{ id: 'gdd', type: 'gdd', title: '생육현황', visible: true }` 추가  
> 기존 위젯 설정(localStorage)과 독립 — `visible: false` 기본값으로 비침습적 추가 가능

### 4-4. API 클라이언트 (`crop-management.api.ts`)

```typescript
import client from '../../api/client'  // 기존 Axios 인스턴스만 재사용

export const cropManagementApi = {
  getBatches: () => client.get('/crop-management/batches'),
  createBatch: (data: CreateCropBatchDto) => client.post('/crop-management/batches', data),
  updateBatch: (id: string, data: UpdateCropBatchDto) => client.put(`/crop-management/batches/${id}`, data),
  deleteBatch: (id: string) => client.delete(`/crop-management/batches/${id}`),
  getBatchGdd: (id: string) => client.get(`/crop-management/batches/${id}/gdd`),
  getMilestones: (id: string) => client.get(`/crop-management/batches/${id}/milestones`),
  getHarvestPrediction: (id: string) => client.get(`/crop-management/batches/${id}/harvest-prediction`),
  getDashboardSummary: () => client.get('/crop-management/dashboard'),
}
```

### 4-5. 페이지 구조 (`CropManagementView.vue`)

```
CropManagementView.vue
  ├── 상단: 그룹별 배치 카드 목록
  │     ├── [배치 없음] → "파종 정보 입력" 버튼 → CropBatchModal
  │     └── [배치 있음] → GDD 진행률 + 현재 단계 표시
  └── 하단: 탭 영역
        ├── [생육 단계] — GDD 프로그레스 바 + 단계별 체크리스트
        ├── [방제·시비] — 마일스톤 타임라인 (완료/임박/예정)
        └── [수확 예측] — 날짜 범위 (낙관/평균/보수)
```

### 4-6. 대시보드 위젯 UI (`GddDashboardWidget.vue`)

**미설정 상태**:
```
┌─────────────────────────────────┐
│ 🌱 생육관리                      │
│                                  │
│  파종 정보를 등록하면              │
│  생육단계와 수확일을 예측합니다.   │
│                                  │
│  [파종 정보 입력 →]              │
└─────────────────────────────────┘
```

**설정된 상태** (그룹별 카드):
```
┌─────────────────────────────────┐
│ 🌱 생육관리                      │
├─────────────────────────────────┤
│ 1동 (방울토마토)                  │
│ 🌿 영양생장기  ████████░░  GDD 342│
│ 🔔 다음: 4/18 역병 방제           │
│ 🍅 예상 수확: 6월 12일경           │
├─────────────────────────────────┤
│ 2동 (오이)                        │
│ 🌸 개화착과기  ██████████  GDD 621│
│ 🔔 다음: 4/20 칼리 시비           │
│ 🥒 예상 수확: 5월 28일경           │
└─────────────────────────────────┘
```

### 4-7. 파종 정보 입력 모달 (`CropBatchModal.vue`)

```
필드:
  작물 선택      [토마토 ▼] [방울토마토] [오이] [딸기] [파프리카]
  묘 타입        ○ 실생묘   ● 접목묘
  파종일         [2026-03-01 📅]
  정식일         [2026-03-25 📅]  (선택)
  기준온도       [10.0 °C]  ← 작물 선택 시 자동 설정, 수동 변경 가능
  하우스(그룹)   [1동 ▼]
  메모           [        ]

  [취소]  [저장]
```

---

## 5. API 응답 예시

### GET `/api/crop-management/batches/:id/gdd`
```json
{
  "batchId": "uuid",
  "currentGdd": 342.5,
  "targetGdd": 1100,
  "progressPct": 31.1,
  "tempSource": {
    "type": "sensor_with_gap_fill",
    "label": "실내 센서 (일부 기상청 보완)",
    "quality": 87,
    "badge": "🟡",
    "offset": 3.2,
    "calibratedAt": "2026-04-10T03:00:00Z"
  },
  "currentStage": {
    "key": "vegetative",
    "label": "영양생장기",
    "icon": "🌾",
    "gddMin": 350,
    "gddMax": 600
  },
  "nextStage": {
    "key": "flowering",
    "label": "개화착과기",
    "gddThreshold": 600,
    "remainingGdd": 257.5
  },
  "calculatedAt": "2026-04-12T10:00:00Z"
}
```

### GET `/api/crop-management/batches/:id/harvest-prediction`

> **구현 참고**: 응답은 중첩 `prediction` 객체 대신 플랫 필드로 제공됩니다.
> 낙관/평균/보수 3단계 대신 `estimatedDate`(현재 속도 기반) + `optimisticDate`/`pessimisticDate` + `seasonal`(기후 정규값 기반) 구조를 사용합니다.

```json
{
  "currentGdd": 342.5,
  "targetGdd": 1100,
  "remainingGdd": 757.5,
  "dailyAvgGdd": 8.2,
  "estimatedDaysLeft": 92,
  "estimatedDate": "2026-07-13",
  "optimisticDate": "2026-06-22",
  "pessimisticDate": "2026-08-02",
  "seasonal": {
    "estimatedDate": "2026-06-28",
    "estimatedDaysLeft": 77,
    "source": "kma_asos",
    "dataYears": 10,
    "monthlyForecast": [
      { "month": "2026-04", "label": "4월", "expectedDailyGdd": 6.1, "role": "actual" },
      { "month": "2026-05", "label": "5월", "expectedDailyGdd": 9.8, "role": "forecast" },
      { "month": "2026-06", "label": "6월", "expectedDailyGdd": 14.2, "role": "forecast" }
    ]
  },
  "predictionMethod": "blended",
  "daysElapsed": 42,
  "confidence": "medium"
}
```

### GET `/api/crop-management/dashboard`

> **구현 참고**: 대시보드 API는 활성 배치(is_active=true) 목록만 반환합니다.
> 배치 없는 그룹은 응답에 포함되지 않으며, `hasBatch` 플래그는 없습니다.
> 각 항목은 배치 ID 기준으로 GDD 계산 결과와 다음 마일스톤을 포함합니다.

```json
[
  {
    "batchId": "uuid",
    "groupId": "uuid",
    "groupName": "1동",
    "cropType": "cherry_tomato",
    "sowingDate": "2026-03-01",
    "gdd": {
      "currentGdd": 342.5,
      "targetGdd": 1100,
      "progressPct": 31.1,
      "currentStage": { "key": "vegetative", "label": "영양생장기", "emoji": "🌾" },
      "tempSource": { "type": "weather_with_offset", "quality": 60 }
    },
    "nextMilestone": {
      "title": "1차 역병 방제",
      "gddThreshold": 450,
      "priority": "high",
      "status": "upcoming"
    }
  }
]
```

---

## 6. 마이그레이션 파일

**파일**: `backend/database/migrations/YYYYMMDD_add_crop_management.sql`

```sql
-- gdd_batches
CREATE TABLE IF NOT EXISTS gdd_batches ( ... );
CREATE INDEX IF NOT EXISTS idx_gdd_batches_user_id ON gdd_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_gdd_batches_group_id ON gdd_batches(group_id) WHERE group_id IS NOT NULL;

-- crop_milestones
CREATE TABLE IF NOT EXISTS crop_milestones ( ... );
CREATE INDEX IF NOT EXISTS idx_crop_milestones_crop ON crop_milestones(crop_type, seedling_type);

-- 마스터 데이터 시드
INSERT INTO crop_milestones (crop_type, milestone_type, gdd_threshold, title, priority) VALUES
  ('tomato', 'pest_control', 200, '1차 역병 방제', 'high'),
  ('tomato', 'fertilizer',   300, '1차 칼슘 시비', 'high'),
  ...
ON CONFLICT DO NOTHING;
```

---

## 7. 구현 순서

```
1단계 — 백엔드 기반 (1일)
  [x] DB 마이그레이션 파일 작성 + 실행
  [x] Entity 2개 작성
  [x] GddService (TimescaleDB 쿼리)
  [x] CropBatchService (CRUD)
  [x] Controller + Module 등록 (app.module.ts 1줄)

2단계 — 프론트 독립 모듈 (1일)
  [x] crop-management.api.ts
  [x] crop-management.types.ts
  [x] useCropBatch.ts composable
  [x] CropBatchModal.vue (입력 모달)

3단계 — 대시보드 위젯 (0.5일)
  [x] GddDashboardWidget.vue
  [x] Dashboard.vue에 위젯 1줄 추가

4단계 — 생육관리 메인 페이지 (1.5일)
  [x] CropManagementView.vue (탭 3개)
  [x] router/index.ts 라우트 1줄
  [x] App.vue 사이드바 링크 1줄

5단계 — 수확 예측 (0.5일)
  [x] harvest-prediction API (KMA 예보 연동)
  [x] 예측 UI 컴포넌트
```

---

## 8. 기존 서비스 변경 요약

| 파일 | 변경 내용 | 변경 줄 수 |
|------|----------|-----------|
| `app.module.ts` | CropManagementModule import + 배열 추가 | **2줄** |
| `router/index.ts` | /crop-management 라우트 추가 | **5줄** |
| `App.vue` | 사이드바 링크 추가 | **4줄** |
| `Dashboard.vue` | 위젯 v-else-if + import | **2줄** |
| **합계** | | **13줄** |

> 기존 파일 변경은 총 13줄. 삭제 시 이 13줄과 신규 폴더 2개만 제거하면 완전 롤백.
