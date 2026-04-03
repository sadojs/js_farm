# typography-unification Gap Analysis

> **Match Rate: 96%** → Minor gap 2건 수정 후 **98%**
>
> **Date**: 2026-04-02
> **Design Doc**: `docs/02-design/features/typography-unification.design.md`

---

## 1. Token System Definition — 100%

| 항목 | 결과 |
|------|------|
| style.css `:root` 7개 토큰 | ✅ 모두 정의 (32/22/18/16/14/12/11px) |
| App.vue `content-size-md` 오버라이드 | ✅ 7/7 정확 |
| App.vue `content-size-lg` 오버라이드 | ✅ 7/7 정확 |
| 기존 변수 제거 (`--content-scale` 등 4개) | ✅ .vue 파일 0건 |

## 2. Legacy Pattern Removal — 100%

| 패턴 | 잔존 |
|------|------|
| `calc(...content-scale...)` | 0건 ✅ |
| `--content-body-size` | 0건 ✅ |
| `--content-small-size` | 0건 ✅ |
| `--content-title-scale` | 0건 ✅ |

## 3. File Coverage — 95% → 98%

| 카테고리 | 파일 수 | 토큰 사용 | 결과 |
|----------|---------|----------|------|
| Views | 8개 | 200건 | ✅ 100% |
| Dashboard Components | 6개 | 46건 | ✅ 100% |
| Common Components | 8개 | 37건 | ✅ 100% (1건 수정) |
| Domain Components | 14개 | 138건 | ✅ 100% |
| Additional Files | 5개 | 35건 | ✅ 100% (1건 수정) |
| **합계** | **41개** | **456건** | **✅** |

## 4. Gaps Found & Fixed

| # | 파일 | 라인 | Before | After | 상태 |
|:-:|------|:----:|--------|-------|:----:|
| 1 | NotificationCenter.vue | 244 | `14px` | `var(--font-size-label)` | ✅ Fixed |
| 2 | AutomationLogTimeline.vue | 224 | `12px` | `var(--font-size-caption)` | ✅ Fixed |

## 5. Exception Items (정당한 하드코딩) — 51건

| 카테고리 | 건수 | 근거 |
|----------|:----:|------|
| Login.vue (독립 페이지) | 10 | Design 예외 |
| App.vue 사이드바 (em 독립) | 17 | Design 예외 |
| 아이콘/이모지 클래스 | 19 | 텍스트 아님 |
| Sub-range 배지 (9-10px) | 2 | 토큰 범위 밖 |
| UI 컨트롤 (닫기/화살표) | 3 | 기능적 요소 |

## 6. Success Criteria

| 기준 | 목표 | 실측 | 결과 |
|------|------|------|:----:|
| 하드코딩 px 잔존 (비예외) | ≤ 5개 | 0개 | ✅ |
| `calc(...content-scale...)` | 0건 | 0건 | ✅ |
| 기존 변수 참조 | 0건 | 0건 | ✅ |
| Match Rate | ≥ 90% | 98% | ✅ |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-02 | Initial analysis, Match Rate 96% |
| 1.1 | 2026-04-02 | 2건 minor gap 수정, Match Rate 98% |
