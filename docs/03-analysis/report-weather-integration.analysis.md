# Report Weather Integration Gap Analysis

> 분석일: 2026-03-27
> Plan: report-weather-integration.plan.md (미확인)
> Design: report-weather-integration.design.md

## 검증 항목 요약

| # | 검증 항목 | Plan | Design | 구현 | 상태 |
|---|----------|------|--------|------|------|
| 1 | weather_data 테이블 신규 (TimescaleDB) | N/A | ✓ | 검증 필요 | NEED_CHECK |
| 2 | WeatherData 엔티티 신규 | N/A | ✓ | 검증 필요 | NEED_CHECK |
| 3 | 복합 PrimaryKey (time, user_id) | N/A | ✓ | 검증 필요 | NEED_CHECK |
| 4 | 기상청 API 연동 (미구현 예상) | N/A | ✓ | 검증 필요 | NEED_CHECK |
| 5 | 날씨 데이터 리포트 통합 | N/A | ✓ | 검증 필요 | NEED_CHECK |

## 매치율
- **전체**: N/A (구현 검증 필요)

## 주요 발견사항

- Design 문서만 존재 (Plan 미확인)
- weather_data 테이블 신규 설계:
  - TimescaleDB Hypertable (sensor_data와 동일 패턴)
  - 복합 PrimaryKey: (time, user_id) — 중복 방지
  - 필드: temperature, humidity, precipitation, wind_speed, condition, nx, ny
  - 사용자별 저장 (지역이 사용자마다 다르므로)
- WeatherData 엔티티 구현:
  - @PrimaryColumn 2개 (time, userId)
  - nullable 필드 여러 개 (기상청 API 응답 일부 누락 가능)
- 기상청 API 연동은 설계에 미명시 (외부 서비스 연동 필요)

## 개선 권고

- weather_data 테이블 마이그레이션 검증:
  - TimescaleDB Hypertable 생성 (SELECT create_hypertable...)
  - 인덱스 생성 (user_id, time DESC)
- WeatherData 엔티티 매핑 검증:
  - @PrimaryColumn 복합키 설정 확인
  - nullable 필드 처리 확인
- 기상청 API 연동 로직 추가 필요 (Design에 미기술)
  - 어떤 엔드포인트? (기상청 단기예보/초단기예보)
  - 수집 주기? (센서와 동기화하는지)
  - 사용자 주소 기반 NX/NY 좌표 변환 필요
