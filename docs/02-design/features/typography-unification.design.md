# Typography Unification Design Document

> **Summary**: CSS 변수 기반 타이포그래피 토큰 시스템 설계 및 전체 프론트엔드 적용 명세
>
> **Feature**: typography-unification
> **Plan Reference**: `docs/01-plan/features/typography-unification.plan.md`
> **Date**: 2026-04-02
> **Status**: Draft

---

## 1. Architecture Overview

### 1.1 현재 상태 (As-Is)

```
style.css :root     → 색상/간격/그림자 변수만 정의 (타이포그래피 없음)
App.vue #app        → --content-scale, --content-body-size, --content-small-size, --content-title-scale
각 컴포넌트          → calc(Npx * var(--content-scale, 1)) 또는 하드코딩 px
```

**문제점:**
- 564개 font-size 선언 중 62%가 하드코딩 px (스케일링 미적용)
- `calc(14px * var(--content-scale, 1))` 패턴이 25개 파일에 174회 반복
- 동일 역할 텍스트에 다른 크기 사용 (본문: 14~17px, 모달 제목: 18~24px)

### 1.2 목표 상태 (To-Be)

```
style.css :root     → --font-size-{token} 7단계 정의
App.vue #app.*      → content-size-sm/md/lg 클래스에서 토큰값 오버라이드
각 컴포넌트          → var(--font-size-body) 형태로 참조 (calc 제거)
```

**핵심 변경**: `calc(Npx * var(--content-scale, 1))` → `var(--font-size-{token})`

---

## 2. Typography Token System

### 2.1 토큰 정의

| Token | 역할 | sm (기본) | md (×1.1) | lg (×1.2) |
|-------|------|-----------|-----------|-----------|
| `--font-size-display` | 대시보드 큰 숫자, 히어로 | 32px | 35px | 38px |
| `--font-size-title` | 페이지 제목 h2 | 22px | 24px | 26px |
| `--font-size-subtitle` | 모달/카드/섹션 제목 h3 | 18px | 20px | 22px |
| `--font-size-body` | 본문 텍스트 | 16px | 17px | 18px |
| `--font-size-label` | 라벨, 보조 텍스트 | 14px | 15px | 16px |
| `--font-size-caption` | 캡션, 힌트, timestamp | 12px | 13px | 14px |
| `--font-size-tiny` | 배지, 태그, 최소 텍스트 | 11px | 12px | 13px |

### 2.2 기존 변수 매핑 (하위 호환)

| 기존 변수 | 신규 토큰 | 처리 |
|-----------|----------|------|
| `--content-body-size` (16/17/18px) | `--font-size-body` | 동일값, 기존 변수 제거 |
| `--content-small-size` (14/15/16px) | `--font-size-label` | 동일값, 기존 변수 제거 |
| `--content-scale` | 삭제 | calc() 패턴 대신 토큰 직접 참조 |
| `--content-title-scale` | 삭제 | `--font-size-title` 로 대체 |

### 2.3 예외 항목 (변경하지 않음)

| 항목 | 위치 | 이유 |
|------|------|------|
| 모바일 header 버튼 `13px !important` | style.css:143 | CLAUDE.md 규칙, content-scale 무시 |
| 모바일 h2 `min(calc(22px * ...), 28px) !important` | style.css:117 | 모바일 제목 최대값 제한 → 토큰 참조로 전환 |
| 사이드바 `em` 단위 | App.vue 사이드바 영역 | 독립 스케일링 |
| 툴팁 `12px` | style.css:184 | 글로벌 고정 크기 유지 |
| Login.vue | Login.vue | 독립 페이지, 스케일링 불필요 |

---

## 3. Implementation Specification

### 3.1 Phase 1: 토큰 시스템 정의

#### 3.1.1 style.css 수정

```css
/* 기존 :root 블록에 추가 */
:root {
  /* ... 기존 색상/간격/그림자 유지 ... */

  /* Typography Scale */
  --font-size-display: 32px;
  --font-size-title: 22px;
  --font-size-subtitle: 18px;
  --font-size-body: 16px;
  --font-size-label: 14px;
  --font-size-caption: 12px;
  --font-size-tiny: 11px;
}
```

#### 3.1.2 App.vue 수정

```css
/* 기존 content-scale 시스템 → 토큰 오버라이드로 교체 */
#app {
  /* 삭제: --content-scale, --content-body-size, --content-small-size, --content-title-scale */
}

#app.content-size-sm {
  /* :root 기본값 사용 (오버라이드 불필요) */
}

#app.content-size-md {
  --font-size-display: 35px;
  --font-size-title: 24px;
  --font-size-subtitle: 20px;
  --font-size-body: 17px;
  --font-size-label: 15px;
  --font-size-caption: 13px;
  --font-size-tiny: 12px;
}

#app.content-size-lg {
  --font-size-display: 38px;
  --font-size-title: 26px;
  --font-size-subtitle: 22px;
  --font-size-body: 18px;
  --font-size-label: 16px;
  --font-size-caption: 14px;
  --font-size-tiny: 13px;
}
```

#### 3.1.3 style.css 모바일 h2 규칙 업데이트

```css
/* Before */
.page-header h2 {
  font-size: min(calc(22px * var(--content-scale, 1)), 28px) !important;
}

/* After */
.page-header h2 {
  font-size: min(var(--font-size-title), 28px) !important;
}
```

#### 3.1.4 App.vue 기존 변수 참조 교체

```css
/* Before */
font-size: var(--content-body-size) !important;
font-size: calc(1em * var(--content-title-scale)) !important;

/* After */
font-size: var(--font-size-label) !important;
font-size: var(--font-size-subtitle) !important;
```

### 3.2 Phase 2: Views 교체 (7개 파일)

각 View 파일에서 `calc(Npx * var(--content-scale, 1))` 패턴과 하드코딩 px을 토큰으로 교체.

#### 교체 규칙 (일괄 적용)

| 기존 패턴 | 토큰 |
|-----------|------|
| `calc(28px * ...)` ~ `calc(32px * ...)`, 하드코딩 28~32px | `var(--font-size-display)` |
| `calc(22px * ...)` ~ `calc(24px * ...)`, 하드코딩 22~24px | `var(--font-size-title)` |
| `calc(18px * ...)` ~ `calc(20px * ...)`, 하드코딩 18~20px | `var(--font-size-subtitle)` |
| `calc(16px * ...)` ~ `calc(17px * ...)`, 하드코딩 16~17px | `var(--font-size-body)` |
| `calc(14px * ...)` ~ `calc(15px * ...)`, 하드코딩 14~15px | `var(--font-size-label)` |
| `calc(12px * ...)` ~ `calc(13px * ...)`, 하드코딩 12~13px | `var(--font-size-caption)` |
| `calc(10px * ...)` ~ `calc(11px * ...)`, 하드코딩 10~11px | `var(--font-size-tiny)` |

#### 파일별 예상 교체량

| View | calc() 교체 | 하드코딩 교체 | 합계 |
|------|------------|-------------|------|
| Groups.vue | ~40 | ~5 | ~45 |
| Devices.vue | ~29 | ~5 | ~34 |
| Reports.vue | ~17 | ~3 | ~20 |
| Sensors.vue | ~15 | ~3 | ~18 |
| Automation.vue | ~15 | ~5 | ~20 |
| Dashboard.vue | ~10 | ~5 | ~15 |
| Alerts.vue | ~8 | ~10 | ~18 |
| UserManagement.vue | 0 | ~13 | ~13 |

### 3.3 Phase 3: Dashboard 컴포넌트 (6개)

| Component | 주요 교체 | 특이사항 |
|-----------|----------|---------|
| SummaryCards.vue | calc() → 토큰 | 큰 숫자에 `--font-size-display` |
| DeviceStatusCards.vue | calc() → 토큰 | |
| MonitoringWidgets.vue | calc() → 토큰 (~12건) | line-height 5건은 유지 |
| ResolvedEnvPanel.vue | calc() → 토큰 | |
| IrrigationHistoryWidget.vue | calc() → 토큰 | |
| GroupEnvScore.vue | calc() → 토큰 | |

### 3.4 Phase 4: Common 컴포넌트 (8개)

| Component | 교체 유형 | 예상 건수 |
|-----------|----------|----------|
| EmptyState.vue | calc() → 토큰 | ~4 |
| ConfirmDialog.vue | 하드코딩 → 토큰 | ~5 |
| ToastContainer.vue | 하드코딩 → 토큰 | ~5 |
| NotificationCenter.vue | 하드코딩 → 토큰 | ~8 |
| TourOverlay.vue | 하드코딩 → 토큰 | ~5 |
| BottomTabBar.vue | 하드코딩 → 토큰 | ~3 |
| DeleteBlockingModal.vue | 하드코딩 → 토큰 | ~4 |
| MoreMenu.vue | 하드코딩 → 토큰 | ~3 |

### 3.5 Phase 5: 도메인 컴포넌트 (~13개)

| 도메인 | Components | 주요 교체 |
|--------|-----------|----------|
| devices | DeviceRegistration.vue (**45건**), IrrigationStatusModal, IrrigationChannelMappingPanel | 하드코딩 → 토큰 |
| admin | UserFormModal.vue (11건), ProjectAssignModal.vue (12건) | 하드코딩 → 토큰 |
| automation | AutomationEditModal, ConditionRow, StepConditionBuilder (17건), StepReview, StepSensorSelect, StepActuatorSelect, StepTargetSelect, StepIrrigationCondition | 혼합 |
| groups | GroupCreation.vue | calc() → 토큰 |

### 3.6 Phase 6: 검증

```bash
# 잔존 하드코딩 검색 (예외 항목만 남아야 함)
grep -rn "font-size:.*[0-9]px" --include="*.vue" frontend/src/

# 기존 calc 패턴 잔존 검색 (0건이어야 함)
grep -rn "calc(.*content-scale" --include="*.vue" frontend/src/

# 기존 변수 참조 잔존 검색 (0건이어야 함)
grep -rn "content-body-size\|content-small-size\|content-title-scale" frontend/src/
```

---

## 4. Migration Rules

### 4.1 판단 기준 (애매한 경우)

| 상황 | 판단 |
|------|------|
| 13px와 14px 사이 | 용도로 판단: 라벨이면 `--font-size-label`, 캡션이면 `--font-size-caption` |
| 20px 제목 | `--font-size-subtitle` (18~22px 범위) |
| 24px 제목 | View 최상단이면 `--font-size-title`, 섹션 내부면 `--font-size-subtitle` |
| 큰 숫자 28px+ | `--font-size-display` |
| 아이콘 옆 텍스트 | 주변 맥락 따라 body 또는 label |

### 4.2 교체 시 주의사항

1. **`!important` 유지**: 기존에 `!important`가 있으면 그대로 유지
2. **line-height 건드리지 않음**: font-size만 교체, line-height는 현행 유지
3. **font-weight 건드리지 않음**: 이번 스코프 밖
4. **미디어 쿼리 내부**: 모바일 전용 font-size도 토큰 적용 (단, style.css 예외 항목 제외)
5. **scoped style 유지**: 각 컴포넌트의 `<style scoped>` 구조 변경 없음

---

## 5. Affected Files Summary

### 5.1 수정 파일 목록 (총 ~37개)

**시스템 (2개)**
- `frontend/src/style.css` — 토큰 정의 추가 + 모바일 h2 규칙 업데이트
- `frontend/src/App.vue` — content-size 오버라이드 교체, 기존 변수 삭제

**Views (8개)**
- Dashboard.vue, Devices.vue, Groups.vue, Sensors.vue
- Reports.vue, Automation.vue, Alerts.vue, UserManagement.vue

**Dashboard Components (6개)**
- SummaryCards.vue, DeviceStatusCards.vue, MonitoringWidgets.vue
- ResolvedEnvPanel.vue, IrrigationHistoryWidget.vue, GroupEnvScore.vue

**Common Components (8개)**
- EmptyState.vue, ConfirmDialog.vue, ToastContainer.vue, NotificationCenter.vue
- TourOverlay.vue, BottomTabBar.vue, DeleteBlockingModal.vue, MoreMenu.vue

**Domain Components (~13개)**
- devices/: DeviceRegistration.vue, IrrigationStatusModal.vue, IrrigationChannelMappingPanel.vue
- admin/: UserFormModal.vue, ProjectAssignModal.vue
- automation/: AutomationEditModal.vue, ConditionRow.vue, StepConditionBuilder.vue, StepReview.vue, StepSensorSelect.vue, StepActuatorSelect.vue, StepTargetSelect.vue, StepIrrigationCondition.vue
- groups/: GroupCreation.vue

### 5.2 변경하지 않는 파일

- `Login.vue` — 독립 페이지
- App.vue 사이드바 영역 — em 단위 독립 스케일링
- style.css 모바일 버튼 13px — CLAUDE.md 규칙

---

## 6. Implementation Order & Dependencies

```
Phase 1 (토큰 정의)
  ├── style.css :root 추가
  ├── App.vue content-size 오버라이드 교체
  └── App.vue 기존 변수 참조 교체
       ↓
Phase 2 (Views) ← Phase 1 완료 후
  ├── Groups.vue (~45건, 가장 큼)
  ├── Devices.vue (~34건)
  ├── Reports.vue, Sensors.vue, Automation.vue
  ├── Dashboard.vue, Alerts.vue
  └── UserManagement.vue
       ↓
Phase 3 (Dashboard Components) ← Phase 2와 병행 가능
  └── 6개 파일
       ↓
Phase 4 (Common Components)
  └── 8개 파일
       ↓
Phase 5 (Domain Components)
  └── ~13개 파일
       ↓
Phase 6 (검증)
  ├── grep 잔존 확인
  ├── sm/md/lg 전환 테스트
  └── 모바일 393px 레이아웃 확인
```

---

## 7. Rollback Strategy

- Git 커밋을 Phase별로 분리하여 문제 발생 시 Phase 단위 롤백 가능
- Phase 1(토큰 정의)은 기존 코드에 영향 없이 추가만 하므로 안전
- Phase 2~5에서 문제 발생 시 해당 파일만 `git checkout` 으로 복원

---

## 8. Success Criteria

| 항목 | 기준 |
|------|------|
| 하드코딩 font-size px 잔존 | 예외 항목 5개 이하 |
| `calc(...content-scale...)` 잔존 | 0건 |
| `--content-scale` 참조 잔존 | style.css 모바일 h2 1건만 허용 → 토큰으로 교체 시 0건 |
| sm/md/lg 전환 | 모든 텍스트 정상 스케일링 |
| 모바일 393px | 레이아웃 깨짐 없음 |
| Gap Analysis Match Rate | >= 90% |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-02 | Initial design | AI Assistant |
