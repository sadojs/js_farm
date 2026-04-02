# Typography Unification Planning Document

> **Summary**: 모든 페이지/컴포넌트의 폰트 사이즈를 타입별로 통일하고 CSS 변수 기반 스케일링 시스템 적용
>
> **Project**: Smart Farm Platform
> **Author**: AI Assistant
> **Date**: 2026-04-02
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

현재 프로젝트 전체에 **58가지 이상의 서로 다른 font-size 값**이 혼재되어 있음. 동일한 역할의 텍스트(예: 페이지 제목)가 파일마다 다른 크기로 지정되어 있고, `--content-scale` 반응형 스케일링이 전체 파일의 **약 40%에만** 적용됨. 이를 통일된 타이포그래피 시스템으로 정리.

### 1.2 Background

- 45~70세 고령 사용자 대상 → 3단계 글꼴 크기 조절 기능 존재 (sm/md/lg)
- `calc(Npx * var(--content-scale, 1))` 패턴이 17개 파일에만 적용, 20+ 파일은 고정 px 사용
- 같은 "본문" 역할에 14px, 15px, 16px, 17px이 혼용
- 모달/카드 제목이 18px ~ 24px까지 제각각

### 1.3 Related Documents

- CLAUDE.md: 모바일 레이아웃 컨벤션 (page-header 13px, h2 max 28px)
- App.vue: content-scale 시스템 정의

---

## 2. Scope

### 2.1 In Scope

- [ ] CSS 변수 기반 타이포그래피 스케일 정의 (style.css `:root`)
- [ ] 모든 Views (7개)의 font-size 통일
- [ ] 모든 Components (~30개)의 font-size 통일
- [ ] 기존 `calc(Npx * var(--content-scale))` 패턴을 CSS 변수로 전환

### 2.2 Out of Scope

- 폰트 패밀리(font-family) 변경
- line-height / letter-spacing 조정 (별도 작업)
- 모바일 page-header 버튼 CSS (이미 style.css에서 글로벌 관리)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 타이포그래피 스케일 CSS 변수 7단계 정의 | High | Pending |
| FR-02 | Views 7개 파일 font-size를 CSS 변수로 교체 | High | Pending |
| FR-03 | Components ~30개 파일 font-size를 CSS 변수로 교체 | High | Pending |
| FR-04 | content-scale 3단계(sm/md/lg) 연동 유지 | High | Pending |
| FR-05 | 모바일(393px) 레이아웃 깨짐 없음 확인 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 일관성 | 동일 타입 텍스트에 동일 CSS 변수 사용 | 코드 검색으로 하드코딩 px 잔존 여부 확인 |
| 호환성 | 기존 3단계 글꼴 크기 조절 정상 동작 | sm/md/lg 전환 시 모든 텍스트 스케일링 확인 |
| 유지보수 | font-size 변경 시 CSS 변수 한 곳만 수정 | 변수 참조 구조 확인 |

---

## 4. Typography Scale Definition

### 4.1 CSS 변수 정의 (7단계)

| 변수명 | 역할 | Base (sm) | md (×1.1) | lg (×1.2) |
|--------|------|-----------|-----------|-----------|
| `--font-size-display` | 히어로/대형 숫자 | 32px | 35px | 38px |
| `--font-size-title` | 페이지 제목 (h2) | 24px | 26px | 28px |
| `--font-size-subtitle` | 섹션/모달/카드 제목 (h3) | 18px | 20px | 22px |
| `--font-size-body` | 본문 텍스트 | 16px | 17px | 18px |
| `--font-size-label` | 라벨/보조 텍스트 | 14px | 15px | 16px |
| `--font-size-caption` | 캡션/작은 텍스트 | 12px | 13px | 14px |
| `--font-size-tiny` | 배지/태그 | 11px | 12px | 13px |

### 4.2 구현 방식

```css
/* style.css :root */
:root {
  --font-size-display: 32px;
  --font-size-title: 24px;
  --font-size-subtitle: 18px;
  --font-size-body: 16px;
  --font-size-label: 14px;
  --font-size-caption: 12px;
  --font-size-tiny: 11px;
}

/* App.vue - content-scale 연동 */
#app.content-size-sm { /* :root 값 그대로 사용 */ }
#app.content-size-md {
  --font-size-display: 35px;
  --font-size-title: 26px;
  --font-size-subtitle: 20px;
  --font-size-body: 17px;
  --font-size-label: 15px;
  --font-size-caption: 13px;
  --font-size-tiny: 12px;
}
#app.content-size-lg {
  --font-size-display: 38px;
  --font-size-title: 28px;
  --font-size-subtitle: 22px;
  --font-size-body: 18px;
  --font-size-label: 16px;
  --font-size-caption: 14px;
  --font-size-tiny: 13px;
}
```

### 4.3 적용 매핑

| 현재 사용처 | 기존 값 (혼재) | 통일 변수 |
|-------------|---------------|----------|
| 페이지 제목 h2 | 28px~32px (calc 포함) | `--font-size-title` |
| 모달/카드 제목 h3 | 18px~24px | `--font-size-subtitle` |
| 대시보드 큰 숫자 | 28px~48px | `--font-size-display` |
| 본문/설명 | 14px~17px | `--font-size-body` |
| 라벨/필드명 | 13px~15px | `--font-size-label` |
| 캡션/힌트/timestamp | 11px~13px | `--font-size-caption` |
| 배지/태그 | 10px~12px | `--font-size-tiny` |
| 모바일 header 버튼 | 13px !important | 유지 (글로벌 style.css) |

---

## 5. 영향 범위

### 5.1 수정 대상 파일

**Global (2개)**
- `frontend/src/style.css` — CSS 변수 정의 추가
- `frontend/src/App.vue` — content-size별 변수 오버라이드

**Views (7개)**
- Dashboard.vue, Devices.vue, Groups.vue, Sensors.vue, Reports.vue, Automation.vue, Alerts.vue

**Components (~25개)**
- dashboard/: SummaryCards, DeviceStatusCards, ResolvedEnvPanel, IrrigationHistoryWidget, MonitoringWidgets, GroupEnvScore
- common/: EmptyState, ConfirmDialog, ToastContainer, NotificationCenter, TourOverlay, BottomTabBar, DeleteBlockingModal, MoreMenu
- devices/: DeviceRegistration, IrrigationStatusModal, IrrigationChannelMappingPanel
- groups/: GroupCreation
- automation/: AutomationEditModal, ConditionRow, StepConditionBuilder, StepReview, StepSensorSelect, StepActuatorSelect, StepTargetSelect, StepIrrigationCondition
- admin/: ProjectAssignModal, UserFormModal

### 5.2 예외 (변경하지 않음)

| 항목 | 이유 |
|------|------|
| 모바일 page-header 버튼 13px !important | CLAUDE.md 규칙: content-scale 무시, style.css 글로벌 관리 |
| 사이드바 em 단위 | App.vue 자체 스케일링, 독립적 |

---

## 6. Success Criteria

### 6.1 Definition of Done

- [ ] CSS 변수 7개 정의 및 3단계 스케일링 동작
- [ ] 모든 대상 파일에서 하드코딩 font-size → CSS 변수 교체
- [ ] sm/md/lg 전환 시 모든 텍스트 정상 스케일링
- [ ] 모바일(393px) 레이아웃 깨짐 없음
- [ ] `grep -r "font-size:.*[0-9]px" --include="*.vue"` 결과에서 예외 항목만 남음

### 6.2 Quality Criteria

- [ ] 하드코딩 font-size 잔존 < 10개 (예외 항목)
- [ ] Gap Analysis Match Rate >= 90%

---

## 7. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 레이아웃 깨짐 | High | Medium | 페이지별 순차 적용 + 확인 |
| 모바일 overflow | High | Medium | 393px 기준 테스트 |
| 기존 calc() 패턴 제거 시 누락 | Medium | Low | grep으로 잔존 확인 |
| 대시보드 큰 숫자 크기 부족 | Low | Low | display 변수 별도 관리 |

---

## 8. Implementation Order

1. **Phase 1**: style.css에 CSS 변수 정의 + App.vue content-size 오버라이드
2. **Phase 2**: Views 7개 파일 교체
3. **Phase 3**: Dashboard 컴포넌트 6개 교체
4. **Phase 4**: Common 컴포넌트 8개 교체
5. **Phase 5**: 도메인 컴포넌트 (devices, groups, automation, admin) 교체
6. **Phase 6**: 최종 grep 검증 + 모바일 확인

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`typography-unification.design.md`)
2. [ ] 구현 시작
3. [ ] Gap Analysis

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-02 | Initial draft | AI Assistant |
