# Design: dashboard-ui-fixes

## 1. 가이드 투어 삭제

### 삭제 파일
- `frontend/src/composables/useOnboardingTour.ts`
- `frontend/src/components/common/TourOverlay.vue`

### 수정 파일: App.vue
- `import { useOnboardingTour }` 제거
- `import TourOverlay from ...` 제거
- `<TourOverlay />` 컴포넌트 태그 제거
- `const tour = useOnboardingTour()` 제거
- `tour.startTour()` 이벤트 핸들러 사이드바 메뉴 항목 2곳 제거
- `tour.shouldShowTour()` 자동 실행 로직 제거

---

## 2. 위젯 설정 실제 동작

### 문제
- `useDashboardLayout`에 `visibleWidgets` (정렬+필터된 배열)이 있으나 `Dashboard.vue`가 이를 무시하고 하드코딩된 순서로 렌더링
- `harvest` 위젯이 defaultLayout에 남아있음 (수확관리 삭제됨)

### 수정: useDashboardLayout.ts
- `harvest` 위젯 defaultLayout에서 제거
- `visibleWidgets`를 `computed`로 변경 (반응성 개선)

### 수정: Dashboard.vue
- 하드코딩된 위젯 블록 제거
- `v-for="widget in visibleWidgets"` 동적 렌더링
- 각 `widget.type`에 따라 컴포넌트 조건부 렌더링

```vue
<template v-for="widget in visibleWidgets" :key="widget.id">
  <!-- weather -->
  <div v-if="widget.type === 'weather'" class="weather-card">...</div>
  <!-- summary -->
  <SummaryCards v-else-if="widget.type === 'summary'" />
</template>
```

---

## 3. 다크모드 화살표 가시성

### 문제
`.btn-order`에 `color` 미지정 → 다크모드에서 버튼 텍스트(↑↓) 안 보임

### 수정: Dashboard.vue CSS
```css
.btn-order {
  color: var(--text-primary);  /* 추가 */
}
```

---

## 4. 리포트 내보내기 중복 제거

### 삭제 대상: Reports.vue
- `showExportMenu` ref 제거
- `handleExport()` 함수 제거
- `<div class="export-dropdown-wrap">...</div>` 블록 제거
- 관련 CSS `.export-dropdown-wrap`, `.export-toggle`, `.export-menu` 제거
