# Plan: dashboard-ui-fixes

## 개요
대시보드 UI 잡다한 문제 4가지를 한 번에 정리하는 작업.

## 작업 목록

### 1. 가이드 투어 기능 삭제
**배경**: 온보딩 투어 기능이 있으나 불필요하여 제거 요청.

**삭제 대상**:
- `frontend/src/composables/useOnboardingTour.ts` — 완전 삭제
- `frontend/src/components/common/TourOverlay.vue` — 완전 삭제
- `frontend/src/views/Dashboard.vue` — tour 관련 import/사용부 제거
- `frontend/src/App.vue` 또는 사이드바 — "가이드 투어" 메뉴 항목 제거

---

### 2. 대시보드 위젯 설정 실제 동작 수정
**배경**: 위젯 설정(표시/숨김, 순서 변경)이 UI는 있으나 실제로 적용이 안 됨.

**현황**:
- `useDashboardLayout.ts` — localStorage `sf-dashboard-layout`으로 저장 로직 존재
- `Dashboard.vue` — 편집 패널에서 체크박스/화살표 버튼으로 제어
- 저장은 되지만 위젯 렌더링이 `widgetOrder`/`visible` 상태를 실제로 반영 안 함

**수정 방향**:
- `useDashboardLayout`의 `widgetOrder`/`visible` 상태가 실제 위젯 렌더 순서와 표시 여부에 연결되도록 수정
- 페이지 새로고침 후에도 설정 유지 확인

---

### 3. 다크모드 위젯 위치 조정 화살표 가시성 수정
**배경**: 다크모드에서 ↑↓ 화살표 버튼이 배경과 비슷한 색이라 잘 안 보임.

**현황**:
- `.btn-order` 스타일: `background: var(--bg-card)`, 텍스트 색상 미지정
- 다크모드에서 `--bg-card: #252525`이므로 검은 배경에 검은(또는 어두운) 텍스트

**수정 방향**:
- `.btn-order`에 명시적 `color` 지정 (다크모드: `var(--text-primary)`)
- 또는 다크모드 전용 override 추가

---

### 4. 리포트 화면 내보내기 중복 제거
**배경**: CSV/PDF 다운로드 버튼이 이미 있는데 "내보내기 ▼" 드롭다운이 중복으로 추가됨.

**현황**:
- "CSV 다운로드" 버튼 (`exportToCSV`)
- "PDF 다운로드" 버튼 (`exportToPDF`)
- "내보내기 ▼" 드롭다운 (`handleExport('csv')`, `handleExport('excel')`) ← 제거 대상

**수정 방향**:
- 드롭다운 `내보내기` 버튼과 관련 state/handler 제거
- 기존 CSV/PDF 다운로드 버튼 유지

---

## 구현 순서

1. 가이드 투어 파일/참조 삭제
2. 리포트 내보내기 중복 제거 (간단)
3. 다크모드 화살표 색상 수정 (간단)
4. 위젯 설정 실제 동작 수정 (핵심 작업)

## 예상 영향 범위
- `frontend/src/composables/useOnboardingTour.ts` (삭제)
- `frontend/src/components/common/TourOverlay.vue` (삭제)
- `frontend/src/views/Dashboard.vue` (수정)
- `frontend/src/composables/useDashboardLayout.ts` (수정 가능)
- `frontend/src/views/Reports.vue` (수정)
- 사이드바 컴포넌트 (가이드 투어 메뉴 제거)
