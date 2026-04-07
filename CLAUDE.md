# Smart Farm Platform

스마트팜 IoT 플랫폼. NestJS 백엔드 + Vue 3 프론트엔드 + PostgreSQL(TimescaleDB) + Redis.

## 프로젝트 구조

```
backend/src/modules/   ← NestJS 모듈 (15개): auth, automation, dashboard, devices,
                         env-config, gateway, groups, integrations, notifications,
                         reports, sensor-alerts, sensors, users, voice, weather
frontend/src/
  views/               ← 페이지 (9개): Dashboard, Devices, Groups, Sensors, Automation,
                         Alerts, Reports, Login, UserManagement
  components/          ← 도메인별 컴포넌트 (admin, automation, common, dashboard, devices, groups, reports, sensors)
  modules/             ← 독립 모듈 (voice-assistant)
  stores/              ← Pinia 스토어 (auth, automation, device, group, notification, notification-center, sensor)
  composables/         ← useAuth, useConfirm, useDashboardLayout, useNotification, useOnboardingTour, useWebSocket
  api/                 ← Axios API 클라이언트 (client.ts + 도메인별 *.api.ts)
  types/               ← TypeScript 타입 정의
shared/                ← 프론트/백엔드 공유 타입
docs/                  ← PDCA 문서 (01-plan, 02-design, 03-analysis)
certs/                 ← 로컬 자체 서명 인증서 (.gitignore 대상)
docker-compose.yml     ← postgres(TimescaleDB), redis, backend, frontend (80+443)
farm.sh                ← Docker 관리 헬퍼 스크립트
```

## 실행 방법

```bash
# Docker로 전체 실행
docker compose up -d

# 개발 모드 (HTTPS — certs/ 폴더에 인증서 있으면 자동 적용)
cd backend && npm run start:dev    # localhost:3000
cd frontend && npm run dev         # https://localhost:5173

# farm.sh 헬퍼
./farm.sh start|stop|restart|logs
```

## 기술 스택

- **Backend**: NestJS + TypeScript, TypeORM, PostgreSQL(TimescaleDB), Redis, WebSocket
- **Frontend**: Vue 3 + TypeScript + Vite, Pinia, vue-i18n (ko/en), Chart.js, xlsx
- **AI**: Claude Code CLI (`claude -p --model sonnet`) — 음성 어시스턴트
- **외부 API**: Tuya IoT (장비 제어/센서), 기상청 KMA API (초단기실황 + 단기예보 + 중기예보)
- **인프라**: Docker Compose, PWA (Service Worker + Web Push), HTTPS (자체 서명)

## 핵심 도메인 관계

장비(Device) → 그룹(Group) → 센서(Sensor) → 환경설정(EnvConfig)
- 장비 삭제/이동 시 그룹·센서·환경설정 의존성 확인 필수
- 3-Tier RBAC: admin / farm_admin / farm_user

## 음성 어시스턴트 (`voice` 모듈)

독립 모듈: `backend/src/modules/voice/` + `frontend/src/modules/voice-assistant/`

### 아키텍처
- Claude Code CLI (`claude -p --model sonnet`)로 자연어 해석 — 구독으로 추가 비용 없음
- 모든 농장 데이터(장치, 자동화, 센서, 날씨, 예보, 알림, 로그)를 context에 넣고 AI가 직접 답변
- 실행 액션 4가지만 핸들러: `control`, `automation_toggle`, `automation_run`, `create_rule`

### 규칙
- **관수는 반드시 자동화 룰로만 실행** — control 직접 제어 금지
- 관수 즉시 실행: startTime을 현재+1분으로 임시 변경 → 크론 실행 → 3분 뒤 복원
- 개폐기 인터록: pairedDevice OFF → 1초 대기 → ON
- 과거형("돌렸어?") = 이력 질문, 절대 제어 명령 아님
- 프롬프트에 현재 시간(KST) 포함

### AI 기능
- 재배 조언 (센서+날씨 기반), 병해충 경고, 센서 알림 대화, 자동화 룰 음성 생성

### 프론트엔드
- Web Speech API: Chrome/Edge 음성 인식, iOS Safari 미지원 → 텍스트 전용
- 모바일 TTS: `unlockAudio()`로 사용자 제스처 시점에 활성화
- 음성 API 타임아웃: 30초 (Claude CLI 응답 시간 고려)

## 코딩 컨벤션

### Backend (NestJS)
- 모듈 구조: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.entity.ts`, `*.dto.ts`
- Entity는 TypeORM 데코레이터 사용, snake_case 컬럼명
- API 경로: `/api/{module}` (복수형)
- ConfigModule: `envFilePath: ['.env', '../.env']` — 루트 .env도 읽음

### Frontend (Vue 3)
- Composition API + `<script setup lang="ts">` 사용
- 스토어: Pinia (`*.store.ts`), API: Axios (`*.api.ts`)
- 컴포넌트: PascalCase 파일명, 도메인별 폴더 분류
- 독립 모듈: `frontend/src/modules/` — 삭제 시 폴더 삭제 + import 제거만으로 완전 제거
- 스타일: `<style scoped>` + CSS 변수 (`--content-scale` 등)
- 다크모드: `#app.theme-dark`에 CSS 변수 정의 — scoped 컴포넌트에서는 CSS 변수로 참조
- i18n: `$t('key')` 사용, `frontend/src/i18n/` 에 ko/en JSON

### 모바일 레이아웃
- 기준 기기: iPhone 15 Pro (393px) + 큰 폰트(content-scale 1.2)
- page-header 버튼: `padding: 8px 12px !important; font-size: 13px !important` (content-scale 무시)
- 모바일 page-header CSS는 style.css 글로벌에서 관리 — 각 뷰에 중복 추가 금지
- h2 제목: `font-size: min(calc(22px * scale), 28px)` 최대값 제한
- `maximum-scale=1.0, user-scalable=no` — iOS 자동줌 방지
- 로그인 input: `autocapitalize="none"` + 소문자 강제 변환

### 자동화 규칙 UI
- 시간 조건: "사이(between)" 범위만 제공 (eq 연산자 없음)
- 관수(irrigation): 시간 기반 모드에서만 표시 (센서 모드 숨김)
- 센서 모드 선택 시: 조건에서 "시간" 필드 제외
- 팬(fan) + 시간 기반: 상단 조건 그룹 숨기고 시간대 스케줄러만 표시
- 관수 액비 검증: 액비모터 ON 시 관주시간 ≥ 투여시간+종료전대기 (프론트+백엔드 3중 검증)

## 공통 컴포넌트 (재사용)

EmptyState, NotificationCenter, TourOverlay, ConfirmDialog, ToastContainer, BottomTabBar, DeleteBlockingModal, VoiceAssistant
— 새 기능 구현 시 기존 컴포넌트 확인 후 재사용할 것

## 프로덕션 서버

- **호스트**: 175.206.245.234
- **SSH 사용자**: jeongseok
- **인증**: SSH 키 (`~/.ssh/id_ed25519`) — 비밀번호 없이 접속 가능
- **프로젝트 경로**: `/Users/jeongseok/Projects/smart-farm-platform`
- **DB**: PostgreSQL (로컬과 동일 스키마, TimescaleDB)
- **HTTPS**: Docker 빌드 시 자체 서명 인증서 자동 생성 (Dockerfile 내)
- **마이그레이션**: `backend/database/migrations/` 디렉토리의 SQL 파일 순서대로 실행

### 배포 검증 프로세스 (필수)

배포 요청 시 소스 배포 전에 반드시 아래 3자 동일성을 검증:

1. **로컬 작업 디렉토리**: 커밋되지 않은 변경사항 없는지 확인 (`git status`)
2. **Git 원격(origin/main)**: 로컬 HEAD와 원격 HEAD가 동일한지 확인 (`git log --oneline -1` vs `git log --oneline -1 origin/main`)
3. **프로덕션 서버**: SSH 접속 후 프로덕션 디렉토리의 `git log --oneline -1`이 위와 동일한지 확인

3곳 모두 동일 커밋이어야 배포 진행. 불일치 시 사용자에게 보고 후 중단.

## 환경 변수 (.env)

```
TUYA_CLIENT_ID, TUYA_CLIENT_SECRET   ← Tuya IoT 플랫폼
KMA_API_KEY                           ← 기상청 API
OPENWEATHER_API_KEY                   ← OpenWeather API
ANTHROPIC_API_KEY                     ← Claude API (음성 어시스턴트 Haiku 폴백, 현재 미사용)
DATABASE_URL, REDIS_URL               ← Docker Compose에서 자동 설정
```
