# Plan: Report Page 완성 - 센서 아카이빙 + UI 리디자인

## 현황 분석

### 백엔드 (이미 구현됨)
- **sensor-collector.service.ts**: 5분마다 Tuya→sensor_data 저장 (Cron)
- **schema.sql**: `sensor_data_hourly`, `sensor_data_daily` Continuous Aggregate 존재
- **sensors.service.ts**: `queryData()` - hourly/daily/raw 집계 쿼리 지원
- **reports.service.ts**: `getStatistics()` - 센서타입별 통계 + daily breakdown
- **reports.controller.ts**: `/reports/statistics`, `/reports/export/csv` 엔드포인트

### 프론트엔드 (부분 구현)
- **Reports.vue**: 필터(그룹/하우스/센서타입/기간/집계) + 통계카드 + 차트 + 테이블 구조 존재
- **report.api.ts**: `getStatistics`, `exportCsv`, `exportPdf` API 호출 정의
- **문제**: Reports.vue가 `report.api.ts`를 사용하지 않고 `sensor-data` API를 직접 호출
- **문제**: 차트/테이블에 데이터 바인딩이 불완전

## 요구사항 (FR)

### FR-01: 센서 데이터 시간단위 아카이빙 확인/보완
- **현황**: TimescaleDB continuous aggregate(`sensor_data_hourly`)가 이미 schema.sql에 정의됨
- **현황**: sensor-collector가 5분마다 데이터 수집 중
- **변경**: 백엔드 reports API가 hourly aggregate를 활용하도록 보완
  - `getStatistics`에 `aggregation` 파라미터 추가
  - hourly 집계 시 `sensor_data_hourly` 뷰 활용
- **영향 파일**: `reports.service.ts`, `reports.controller.ts`, `report.api.ts`
- **우선순위**: High

### FR-02: 리포트 UI 리디자인 (첨부 디자인 참고)
- **현황**: 현재 통계카드 4개(평균/최대/최소/데이터수), 차트1개, 테이블1개
- **변경** (첨부 디자인 기반):
  - 기간선택: 버튼그룹(1일/7일/1개월/기간선택) — 현재 select → 버튼 그룹으로
  - 다운로드: CSV/PDF 버튼 — 현재와 동일 유지
  - 통계카드 3개: 평균온도, 평균습도, 장비가동시간
  - 차트1: "온도 및 습도 추이" — Line Chart (온도+습도 이중 Y축)
  - 차트2: "장비 가동 현황" — Bar Chart (시간대별 가동 장비 수)
  - 상세데이터 테이블: 시간/온도/습도/가동장비
  - **기존 그룹/하우스/센서타입 필터는 유지**
- **영향 파일**: `views/Reports.vue`
- **우선순위**: High

### FR-03: Reports API ↔ UI 연동 완성
- **현황**: Reports.vue가 report.api.ts를 제대로 사용하지 않음
- **변경**:
  - `report.api.ts`에 `getHourlyData`, `getActuatorStats` 추가
  - Reports.vue에서 report.api를 통해 데이터 로드
  - 차트 데이터 바인딩 (vue-chartjs 이미 설치됨)
- **영향 파일**: `report.api.ts`, `views/Reports.vue`
- **우선순위**: High

### FR-04: 장비 가동 통계 API 추가
- **현황**: 장비 가동 시간/횟수 통계 API 없음
- **변경**:
  - `automation_logs` 테이블에서 장비 가동 데이터 집계
  - `/reports/actuator-stats` 엔드포인트 추가
  - 시간대별 가동 장비 수 반환
- **영향 파일**: `reports.service.ts`, `reports.controller.ts`
- **우선순위**: Medium

## 구현 순서

| Phase | FR | 작업 | 파일 |
|-------|-----|------|------|
| 1 | FR-01 | reports API에 aggregation 파라미터 + hourly 쿼리 | reports.service.ts, reports.controller.ts |
| 2 | FR-04 | 장비 가동 통계 API 추가 | reports.service.ts, reports.controller.ts |
| 3 | FR-03 | report.api.ts 확장 (hourly, actuator-stats) | report.api.ts |
| 4 | FR-02 | Reports.vue UI 리디자인 + 데이터 연동 | Reports.vue |
| 5 | ALL | 빌드 확인 + 다크모드 CSS변수 적용 | Reports.vue |
