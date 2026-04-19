# Plan: 적산온도 기반 생육관리 (GDD Crop Management)

**Feature ID**: growing-degree-days  
**작성일**: 2026-04-12  
**Phase**: Plan  
**Status**: Active

---

## 1. 목표

파종일·정식일·묘 타입을 하우스(그룹)별로 등록하면,  
이미 수집 중인 **기상청 온도 데이터(weather_data)**로 적산온도를 자동 계산해  
**생육 단계 추적 → 방제·시비 알림 → 수확일 예측**을 한 화면에 제공한다.

---

## 2. 사용자 플로우

```
대시보드 진입
  ↓
각 그룹(농장) 카드에 적산온도 위젯 표시
  ├─ [파종일 미설정] → "파종 정보를 입력해주세요" 버튼 → 입력 모달
  └─ [파종일 설정됨] → 생육단계 / 다음 이벤트 / 예상 수확일 간략 표시
       ↓ 카드 클릭
       생육관리 상세 페이지 (신규 라우트: /crop-management)
         ├─ 생육 단계 트래커 (GDD 진행률 + 현재 엽수)
         ├─ 방제·시비 타이밍 알림 목록
         └─ 수확일 예측 (현재 GDD + KMA 예보 시뮬레이션)
```

---

## 3. 기능 요구사항

### FR-01 — 작물 재배 정보 등록 (입력 모달)

그룹(하우스)별로 아래 정보를 등록한다:

| 필드 | 타입 | 설명 |
|------|------|------|
| crop_type | enum | 작물 종류 (토마토/방울토마토/오이/딸기/파프리카) |
| seedling_type | enum | 묘 타입: `실생묘` / `접목묘` |
| sowing_date | date | 파종일 |
| transplant_date | date | 정식일 (nullable — 실생묘는 필수, 접목은 선택) |
| base_temp | decimal | 기준온도 (default: 작물별 자동 설정, 수동 변경 가능) |

**저장 위치**: `crop_batches` 신규 테이블 (group_id FK)

---

### FR-02 — 대시보드 위젯

**미설정 상태**: 그룹 카드에 "🌱 파종 정보 입력" CTA 버튼  
**설정된 상태**: 3줄 요약 표시

```
🌿 영양생장기  GDD 342/600
📅 다음 이벤트: 4/18 — 1차 역병 방제
🍅 예상 수확: 약 6월 12일
```

---

### FR-03 — 생육 단계 자동 추적 (상세 페이지)

**계산 방식**:
```sql
SELECT COALESCE(SUM(GREATEST(AVG(temperature) - :basetemp, 0)), 0) AS gdd
FROM weather_data
WHERE user_id = :userId
  AND time >= :sowingDate  -- 파종일 기준
GROUP BY time_bucket('1 day', time)
```

**단계 정의 (토마토 기준, 실생묘)**:

| 단계 | 누적 GDD | 표시 | 비고 |
|------|---------|------|------|
| 발아기 | 0~80 | 🌱 발아기 | 파종→발아 |
| 육묘기 | 80~200 | 🌿 육묘기 | 1~4엽 전개 |
| 활착기 | 200~350 | 💪 활착기 | 정식 후 뿌리 정착 |
| 영양생장기 | 350~600 | 🌾 영양생장기 | 5~8엽, 순 왕성 |
| 개화착과기 | 600~900 | 🌸 개화착과기 | 1화방 개화 |
| 과비대기 | 900~1200 | 🍅 과비대기 | 착과 → 비대 |
| 수확기 | 1200+ | ✂️ 수확기 | — |

> **접목묘**: 활착기 GDD 임계값 -15% (뿌리 발달 우수)  
> **작물별 기준온도**: 토마토 10°C, 오이 12°C, 딸기 5°C, 파프리카 10°C

**UI**: 수평 프로그레스 바 + 현재 단계 강조 + 예상 엽수 표시

---

### FR-04 — 방제·시비 타이밍 알림 (상세 페이지)

`crop_milestones` 마스터 테이블에 GDD 임계값 저장:

| crop_type | milestone_type | gdd_threshold | title | description |
|-----------|---------------|---------------|-------|-------------|
| tomato | pest_control | 200 | 1차 역병 방제 | 온·습도 높은 날 집중 발생 |
| tomato | pest_control | 450 | 진딧물 방제 | 신초 확인 필수 |
| tomato | fertilizer | 300 | 1차 칼슘 시비 | 배꼽썩음병 예방 |
| tomato | pest_control | 700 | 2차 역병 방제 | 개화기 감수성 증가 |
| tomato | fertilizer | 600 | 칼리 증량 | 과실 비대 촉진 |
| ... | ... | ... | ... | ... |

**화면 표시**: 
- ✅ 완료된 마일스톤 (회색)
- 🔔 현재 GDD 기준 ±50 이내 → **주황색 강조** (임박)
- ⏳ 향후 마일스톤 (파란색)

**알림 연동**: 기존 `sensor-alerts` 모듈에 `gdd_threshold` 타입 추가

---

### FR-05 — 수확일 예측 (상세 페이지)

```
수확까지 필요한 잔여 GDD = 목표GDD - 현재누적GDD

예측 방법:
1. KMA 단기예보 3일 기온 → 일별 예상 GDD 계산
2. 3일 이후: 과거 동기간 평균 기온으로 외삽
3. 잔여 GDD / 일평균 예상 GDD = 예상 잔여 일수
4. 오늘 + 잔여 일수 = 예상 수확 가능일
```

**표시**:
```
현재 적산온도:  842°C
수확 목표:    1,200°C  
잔여:          358°C
───────────────────────
예보 기반 일평균 GDD: +8.2°C/일 (향후 3일)
→ 예상 수확: 약 44일 후 (6월 12일경)

[낙관] 6월 5일  |  [평균] 6월 12일  |  [보수] 6월 20일
```

---

### FR-06 — 신규 페이지 구조

**라우트**: `/crop-management`  
**사이드바 메뉴**: "생육관리" (Groups 아래, 새 아이콘: 🌱)  
**뷰 파일**: `frontend/src/views/CropManagement.vue`

**탭 구성**:
- [생육 현황] — 전체 그룹 카드뷰 + 각 그룹별 GDD 진행 상황
- [방제·시비 일정] — 다가오는 마일스톤 전체 리스트
- [수확 예측] — 그룹별 예상 수확일 테이블

---

## 4. 데이터 설계

### 신규 테이블 (2개)

#### `crop_batches`
```sql
CREATE TABLE crop_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  group_id      UUID REFERENCES house_groups(id) ON DELETE CASCADE,
  crop_type     VARCHAR(30) NOT NULL,  -- tomato, cherry_tomato, cucumber, strawberry, paprika
  seedling_type VARCHAR(20) NOT NULL,  -- seedling (실생묘), grafted (접목묘)
  sowing_date   DATE NOT NULL,
  transplant_date DATE,
  base_temp     DECIMAL(4,1) NOT NULL DEFAULT 10.0,
  target_gdd    DECIMAL(7,1),         -- 수확 목표 GDD (작물별 default 자동 설정)
  notes         TEXT,
  is_active     BOOLEAN DEFAULT TRUE, -- 현재 재배 중인 배치
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

#### `crop_milestones`
```sql
CREATE TABLE crop_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_type       VARCHAR(30) NOT NULL,
  seedling_type   VARCHAR(20),         -- NULL이면 공통
  milestone_type  VARCHAR(30) NOT NULL, -- pest_control, fertilizer, pruning, stage
  gdd_threshold   DECIMAL(7,1) NOT NULL,
  title           VARCHAR(100) NOT NULL,
  description     TEXT,
  priority        VARCHAR(10) DEFAULT 'normal',  -- high, normal, low
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
-- 마스터 데이터: 작물별 방제/시비 일정 시드 데이터 포함
```

### 기존 테이블 변경 없음
`house_groups`, `weather_data` 등 기존 스키마 변경 없이 FK로만 연결

---

## 5. 구현 복잡도 & 구현 순서

| 순서 | 작업 | 난이도 | 예상 시간 |
|------|------|--------|---------|
| 1 | DB 마이그레이션 (crop_batches + crop_milestones) + 시드 | 낮음 | 0.5일 |
| 2 | GDD 계산 서비스 (`gdd.service.ts`) | 낮음 | 0.5일 |
| 3 | 대시보드 위젯 (미설정 CTA + 설정됨 3줄 요약) | 낮음 | 0.5일 |
| 4 | 파종 정보 입력 모달 (`CropBatchModal.vue`) | 낮음 | 0.5일 |
| 5 | CropManagement.vue — 생육 현황 탭 | 중간 | 1일 |
| 6 | 방제·시비 타이밍 탭 | 낮음 | 0.5일 |
| 7 | 수확일 예측 탭 (KMA 예보 연동) | 중간 | 1일 |
| **합계** | | | **4.5일** |

---

## 6. 기술 스택 활용

| 기능 | 활용 기술 | 비고 |
|------|----------|------|
| GDD 계산 | TimescaleDB `time_bucket` + `AVG` | 기존 weather_data |
| 단기 예보 | KMA API (이미 연동) | voice.service.ts 재사용 |
| 알림 | 기존 sensor-alerts 모듈 | gdd_threshold 타입 추가 |
| 차트 | Chart.js (이미 도입) | GDD 진행 곡선 |
| 음성 | voice.service.ts context 추가 | "수확 언제야?" 질의 |

---

## 7. MVP 범위 (Phase 1)

빠른 가치를 위해 첫 구현은:
- ✅ 파종 정보 입력 (crop_batches)
- ✅ GDD 누적 계산 + 생육단계 표시
- ✅ 대시보드 위젯 (3줄 요약 + 미설정 CTA)
- ✅ 방제·시비 타이밍 리스트 (토마토 우선)
- ✅ 수확일 예측 (단순 선형 외삽)

Phase 2 (추후):
- 음성 어시스턴트 GDD 컨텍스트 추가
- 복수 배치 관리 (같은 하우스 연이어 파종)
- 연도별 GDD 비교 리포트

---

## 8. 다음 단계

→ `/pdca design growing-degree-days` 로 설계 문서 작성
