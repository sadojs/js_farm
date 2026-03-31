# Plan: 센서알림 — 활성 알림만 표시

## 개요

센서알림(Alerts) 페이지에서 이미 해결(resolved)되었거나 삭제된 알림을 표시하지 않고, 현재 발생 중인 알림만 보여준다.

## 현재 문제

- 프론트엔드 `getAlerts()`가 파라미터 없이 호출 → 백엔드가 resolved/unresolved 전체 반환
- 기본 필터가 `'all'` → 해결된 건도 목록에 표시됨
- 사용자는 현재 발생 중인 알림만 보고 싶음

## 변경 내용

### 1. 프론트엔드 (Alerts.vue)

| 항목 | Before | After |
|------|--------|-------|
| 기본 필터 | `'all'` | `'unresolved'` |
| API 호출 | `getAlerts()` (전체) | `getAlerts({ resolved: 'false' })` (미해결만) |
| 필터 옵션 | all/unresolved/critical/warning/resolved | unresolved/critical/warning (resolved 탭 제거) |

### 2. 백엔드

변경 없음 — 이미 `resolved` 쿼리 파라미터를 지원함 (`GET /sensor-alerts?resolved=false`)

## 영향 범위

- 수정 파일: `frontend/src/views/Alerts.vue` (1개)
- DB 변경: 없음
- API 변경: 없음 (기존 파라미터 활용)
