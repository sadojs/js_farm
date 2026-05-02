# Rule Wizard V2 (의도 기반 자동제어 룰 위저드) Planning Document

> **Summary**: 농부가 30초 이내에 자동제어 룰을 만들 수 있는 "의도 기반(Intent-first)" 위저드 신규 추가
>
> **Project**: Smart Farm Platform
> **Version**: 현행
> **Author**: katsuhisa91
> **Date**: 2026-04-27
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

기존 5단계 위저드(`RuleWizardModal.vue`)는 기술적 용어와 복잡한 조건 설정으로 농부에게 진입 장벽이 높다.
신규 V2 위저드는 "무엇을 하고 싶으세요?" 의도 선택부터 시작해 4~5단계 안에 룰을 완성하도록 한다.
기존 위저드는 "고급 모드"로 유지하고, V2에서 '고급' 의도 선택 시에만 폴백으로 호출된다.

### 1.2 Background

- 기존 위저드: 5단계, 기술 용어(센서 기반/시간 기반/하이브리드/AND/OR) 노출 → 농부 UX 불친화
- 주요 사용 패턴 3가지(관수/개폐기/환풍기)가 전체 룰의 약 90% 이상 차지
- 원복 가능성을 고려해 **완전 독립 모듈**(`frontend/src/components/automation/v2/`)로 분리
- 기존 `RuleWizardModal.vue`, `automation.store.ts` API 시그니처, `backend/` 디렉토리 일체 수정 금지

### 1.3 Related Documents

- 기존 위저드: `frontend/src/components/automation/RuleWizardModal.vue`
- 자동화 스토어: `frontend/src/stores/automation.store.ts`
- 통합 지점: `frontend/src/views/Automation.vue`

---

## 2. Scope

### 2.1 In Scope

- [ ] `frontend/src/components/automation/v2/` 디렉토리 신규 생성 (독립 모듈)
- [ ] IntentWizardModal.vue — 루트 모달 (헤더 진행률 · 동적 스텝 렌더링 · 하단 푸터)
- [ ] StepFarmSelect.vue — 그룹 선택 (1개면 자동 스킵)
- [ ] StepIntentSelect.vue — 의도 4개 카드 선택
- [ ] StepIrrigationDevice.vue — 관수 컨트롤러 단수 선택
- [ ] StepIrrigationValve.vue — 밸브 복수 선택 + 액비 옵션
- [ ] StepDeviceByIntent.vue — 개폐기/환풍기 장치 복수 선택 공용
- [ ] StepTimingByIntent.vue — 시간 탭 / 온도 탭 분기
- [ ] StepReviewSummary.vue — 자연어 요약 + 룰 이름 편집 + 만들기
- [ ] `frontend/src/composables/useRuleWizardV2.ts` — 위저드 상태·스텝 관리
- [ ] `frontend/src/utils/ruleNameGenerator.ts` — 자연어 룰 이름 자동 생성
- [ ] `frontend/src/components/automation/v2/transformV2ToLegacy.ts` — V2 → 기존 API DTO 변환
- [ ] `frontend/src/components/automation/v2/types.ts` — 타입 정의
- [ ] `frontend/src/views/Automation.vue` 최소 수정 (버튼 핸들러 + IntentWizardModal 마운트)
- [ ] `frontend/src/i18n/locales/ko.ts` — `wizardV2.*` 네임스페이스 키 추가

### 2.2 Out of Scope

- 백엔드 코드 수정 (`backend/` 디렉토리 일체 변경 금지)
- `frontend/src/components/automation/RuleWizardModal.vue` 및 하위 Step* 컴포넌트 수정
- `frontend/src/stores/automation.store.ts`의 `createRule()` 시그니처 변경
- "알림만" 의도 추가
- 관수 분기에서 센서 조건 UI 노출
- 새 npm 패키지 추가

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 의도 4개(관수/개폐기/환풍기/고급) 카드 선택 | High | Pending |
| FR-02 | 그룹 1개면 농장 선택 단계 자동 스킵 | High | Pending |
| FR-03 | 관수: 컨트롤러 단수 → 밸브 복수 2단계 | High | Pending |
| FR-04 | 개폐기/환풍기: 장치 복수 선택 1단계 | High | Pending |
| FR-05 | 관수 시간 설정: 요일+시작시각+지속분, 여러 시간대 추가 가능 | High | Pending |
| FR-06 | 개폐기/환풍기: 시간 탭(between) 또는 온도 탭(히스테리시스) 선택 | High | Pending |
| FR-07 | 온도 조건 히스테리시스: 기준+편차 입력 → ON/OFF 임계값 자동 계산 | High | Pending |
| FR-08 | 자연어 요약 화면에서 각 섹션 클릭 시 해당 스텝으로 점프 | Medium | Pending |
| FR-09 | 룰 이름 자동 생성 + 편집 가능 input | High | Pending |
| FR-10 | '고급' 의도 선택 시 V1 RuleWizardModal로 폴백 (emit) | High | Pending |
| FR-11 | 8CH 컨트롤러: 액비 옵션 숨김, 12CH: 액비 옵션 노출 | High | Pending |
| FR-12 | 12CH 액비 혼합 선택 시 switch_11(mixer)/switch_12(fertilizer) 자동 매핑 | High | Pending |
| FR-13 | 개폐기 인터록 안내 문구 표시 (1초 순차 동작) | High | Pending |
| FR-14 | 진행률 점 동적 표시 (관수 5개, 그 외 4개) | Medium | Pending |
| FR-15 | V2→Legacy DTO 변환 후 automation.store.createRule() 호출 | High | Pending |
| FR-16 | 성공: 토스트 + 모달 닫기 / 실패: 에러 토스트 + 모달 유지 | High | Pending |
| FR-17 | ESC 키 / 배경 클릭으로 닫기 (Step 4는 confirm 필요) | Medium | Pending |
| FR-18 | i18n `wizardV2.*` 네임스페이스로 한국어 키 추가 | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 룰 생성 완료까지 30초 이내 (사용자 조작 기준) | 수동 시나리오 타이밍 |
| Mobile | 아이폰 15 Pro (393px) + content-scale 1.2 레이아웃 정상 | 시뮬레이터 검증 |
| 역방향 호환 | 기존 V1 위저드/자동화 룰 목록 동작 무영향 | git diff 0줄 검증 |
| Build | TypeScript 에러 0, ESLint 에러 0, npm run build 성공 | CI/빌드 로그 |
| Accessibility | 닫기 버튼, 진행률, 체크박스 aria-label 필수 | 코드 리뷰 |
| 터치 타겟 | 모든 버튼/카드 최소 44×44px (카드 최소 높이 72px) | 시뮬레이터 검증 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 4개 시나리오 수동 검증 모두 통과
  - 시나리오 1: 관수 (5스텝, 그룹 자동 스킵 시)
  - 시나리오 2: 개폐기 시간 기반 (4스텝)
  - 시나리오 3: 환풍기 온도 기반 (4스텝)
  - 시나리오 4: 고급 → V1 폴백 (1스텝)
- [ ] `git diff backend/` 결과 0줄
- [ ] `git diff frontend/src/components/automation/RuleWizardModal.vue` 결과 0줄
- [ ] `npm run build` 성공
- [ ] TypeScript/ESLint 에러 0
- [ ] 모바일(393px, content-scale 1.2) 모든 스텝 레이아웃 정상

### 4.2 Quality Criteria

- [ ] 동작 선택 UI (열기/닫기/켜기/끄기 라디오) 어디에도 없음
- [ ] eq 연산자 사용 안 됨 (시간 조건은 between만)
- [ ] 관수 분기에서 센서 조건 UI 미노출
- [ ] 기술 용어(센서 기반/시간 기반/하이브리드/AND/OR) UI 미노출
- [ ] focus-visible 아웃라인 적용

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 기존 CreateRuleDto 스키마 파악 오류로 API 실패 | High | Medium | 구현 전 automation.store.ts/automation.api.ts/RuleWizardModal 정독 의무화 |
| 온도 히스테리시스를 기존 백엔드가 지원 못할 수 있음 | High | Low | metadata 필드에 원본값 보존 + 가능한 가장 가까운 스키마로 변환 |
| 개폐기 페어 구조 파악 오류 | Medium | Medium | device.store.ts/device.types.ts 코드 정독 후 결정 |
| 모바일 풀스크린 모달 safe-area 충돌 | Medium | Low | env(safe-area-inset-bottom) 반영, 시뮬레이터 조기 검증 |
| V2 도입 후 V1으로 원복 필요 | Medium | Low | v2/ 독립 모듈 분리, Automation.vue 최소 수정으로 1~2줄 롤백 가능 |

---

## 6. Architecture Considerations

### 6.1 Project Level

**Enterprise** (기존 프로젝트 수준 유지)

### 6.2 Key Architectural Decisions

| Decision | Selected | Rationale |
|----------|----------|-----------|
| 위저드 격리 | 독립 디렉토리 `v2/` | 원복 시 디렉토리 삭제 + Automation.vue 3줄 되돌리기만으로 완전 롤백 |
| 상태 관리 | `useRuleWizardV2` composable (로컬) | Pinia 스토어 불필요, 모달 수명 동안만 상태 유지 |
| API 연동 | 기존 `automation.store.createRule()` | 백엔드/스토어 무변경 원칙 |
| 변환 레이어 | `transformV2ToLegacy.ts` | V2 상태 → 기존 CreateRuleDto, 백엔드 스키마 무변경 |
| 스타일 | 기존 CSS 변수 100% 재사용 | 새 팔레트/spacing 변수 생성 금지 |
| 모달 렌더링 | `<Teleport to="body">` | z-index 충돌 방지 |

### 6.3 Folder Structure

```
frontend/src/
  components/automation/
    v2/                          ← 신규 독립 모듈 (삭제만으로 롤백)
      types.ts
      transformV2ToLegacy.ts
      IntentWizardModal.vue
      StepFarmSelect.vue
      StepIntentSelect.vue
      StepIrrigationDevice.vue
      StepIrrigationValve.vue
      StepDeviceByIntent.vue
      StepTimingByIntent.vue
      StepReviewSummary.vue
  composables/
    useRuleWizardV2.ts           ← 신규
  utils/
    ruleNameGenerator.ts         ← 신규
  views/
    Automation.vue               ← 최소 수정 (import 추가 + 버튼 핸들러 변경)
  i18n/locales/
    ko.ts                        ← wizardV2.* 키 추가
```

### 6.4 롤백 절차 (원복 방법)

1. `frontend/src/components/automation/v2/` 디렉토리 삭제
2. `frontend/src/composables/useRuleWizardV2.ts` 삭제
3. `frontend/src/utils/ruleNameGenerator.ts` 삭제
4. `frontend/src/views/Automation.vue`에서 V2 관련 3~5줄 되돌리기
5. `frontend/src/i18n/locales/ko.ts`에서 `wizardV2` 섹션 삭제
6. `npm run build` 확인

---

## 7. Convention Prerequisites

### 7.1 Existing Conventions 준수

- [x] `CLAUDE.md` 코딩 컨벤션 섹션 존재
- [x] ESLint 설정 (`.eslintrc.*`)
- [x] TypeScript 설정 (`tsconfig.json`)

### 7.2 Conventions to Apply

| Category | Rule |
|----------|------|
| 컴포넌트 명 | PascalCase, `v2/` 하위에 위치 |
| Composition API | `<script setup lang="ts">` |
| 스타일 | `<style scoped>` + CSS 변수 |
| 다크모드 | `#app.theme-dark` CSS 변수로 참조 |
| 모바일 헤더 | style.css 글로벌 규칙 사용, 각 컴포넌트 중복 추가 금지 |
| 터치 타겟 | 최소 44×44px, 카드 72px |
| 한국어 말투 | 친근체 (예: "~하고 싶어요", "~해볼까요?") |

### 7.3 Environment Variables

신규 환경 변수 불필요 (기존 API 재사용).

---

## 8. Implementation Order

1. **탐색** — 기존 코드 정독 (automation.store, automation.api, RuleWizardModal, device.store, group.store, CSS 변수)
2. **타입/유틸** — `types.ts` → `useRuleWizardV2.ts` → `ruleNameGenerator.ts` → `transformV2ToLegacy.ts`
3. **컴포넌트** (의존 순서)
   - StepIntentSelect → StepFarmSelect → StepIrrigationDevice → StepIrrigationValve
   - → StepDeviceByIntent → StepTimingByIntent → StepReviewSummary → IntentWizardModal
4. **통합** — Automation.vue 최소 수정
5. **검증** — 빌드, 4개 시나리오, 모바일 레이아웃, git diff

---

## 9. Next Steps

1. [ ] `/pdca design rule-wizard-v2` — 상세 설계 문서 작성
2. [ ] 기존 파일 탐색 (automation.store.ts, RuleWizardModal.vue, device.store.ts)
3. [ ] 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-27 | Initial draft | katsuhisa91 |
