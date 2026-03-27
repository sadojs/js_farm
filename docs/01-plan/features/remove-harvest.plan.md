# Plan: 수확관리 기능 전체 삭제

## Overview
수확관리 기능(harvest, harvest-rec)을 코드베이스에서 완전히 제거한다.
현재 미사용/불필요한 기능으로 판단되어 코드 단순화 목적으로 삭제한다.

## Problem Statement
- 수확관리 기능이 실제 사용되지 않으며 유지보수 부담만 증가
- 백엔드 2개 모듈, 프론트엔드 뷰/컴포넌트/API가 잔존하여 빌드 크기 불필요하게 증가
- PDCA 문서도 다수 잔존

## Scope

### 삭제 대상

#### 백엔드
- `backend/src/modules/harvest/` (전체)
- `backend/src/modules/harvest-rec/` (전체)
- `backend/src/app.module.ts` — HarvestModule, HarvestRecModule import/등록 제거

#### 프론트엔드
- `frontend/src/views/Harvest.vue`
- `frontend/src/views/HarvestRecommendation.vue`
- `frontend/src/components/harvest/` (전체)
- `frontend/src/api/harvest.api.ts`
- `frontend/src/api/harvest-task.api.ts`
- `frontend/src/api/harvest-recommendation.api.ts`
- `frontend/src/utils/harvest-presets.ts`
- `frontend/src/router/index.ts` — `/harvest`, `/harvest-rec` 라우트 제거
- `frontend/src/App.vue` — 사이드바 harvest-rec 링크 제거

#### 문서
- `docs/01-plan/features/harvest-*.plan.md` (3개)
- `docs/02-design/features/harvest-*.design.md` (3개)
- `docs/03-analysis/harvest-*.analysis.md` (3개)

### 삭제 제외 (영향 없음)
- `backend/dist/` — 빌드 산출물, 재빌드 시 자동 제거
- `screenshots/`, `screenshots_resized/` — 임시 파일, git 미추적

## Risk & Consideration
- DB 테이블(crop_batches, batch_tasks 등)은 코드 삭제 후에도 잔존 — 별도 migration 필요 시 검토
- 다른 모듈에서 harvest 모듈을 참조하는지 확인 필요

## Success Criteria
- 빌드 에러 없이 프론트엔드/백엔드 정상 실행
- 사이드바에 수확관리 메뉴 미노출
- harvest 관련 API 엔드포인트 제거 확인
