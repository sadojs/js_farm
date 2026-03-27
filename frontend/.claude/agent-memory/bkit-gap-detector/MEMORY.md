# Gap Detector Memory

## Project: smart-farm-platform

### Key Paths
- Frontend: `frontend/src/`
- Views: `frontend/src/views/`
- Components: `frontend/src/components/`
- Utils: `frontend/src/utils/`
- Design docs: `docs/02-design/features/`
- Analysis docs: `docs/03-analysis/`

### Completed Analyses
- **design-improvement**: 89% -> 95% after Act-1 (2026-03-02). 8 FRs, mobile UX focus.
  - Key pattern: Vue SFC with scoped CSS, `@media (max-width: 768px)` blocks
  - Body scroll lock: simplified `overflow: hidden` pattern (not full `position: fixed`)
  - VueDatePicker: uses `@vuepic/vue-datepicker`, locale via `date-fns/locale`
  - Theme detection: `useLocalStorage('sf-theme', 'light')` + computed isDark

### Project Conventions
- Framework: Vue 3 + TypeScript (Composition API, `<script setup>`)
- CSS: Scoped styles, CSS variables (--text-primary, --bg-card, --accent, etc.)
- Mobile breakpoint: 768px
- Safe area: `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`
- Modals: `.modal-overlay` + `.modal-content`/`.modal-container` pattern
- State management: Pinia stores (`*.store.ts`)
- API layer: `*.api.ts` files in `frontend/src/api/`
