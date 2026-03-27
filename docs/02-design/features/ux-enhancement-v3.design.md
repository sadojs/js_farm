# Design: UX Enhancement V3 — 전체 UI/UX 개선 및 신규 기능

## Feature ID
`ux-enhancement-v3`

## Date
2026-03-27

## Plan Reference
`docs/01-plan/features/ux-enhancement-v3.plan.md`

---

## 1. 전체 구조

### 1.1 범위 요약

| 카테고리 | 항목 수 | 설명 |
|----------|---------|------|
| UI/UX 개선 | 6건 | A-01 ~ A-06 (미해결 디자인 이슈) |
| 신규 기능 | 8건 | B-01 ~ B-08 (알림, 로그, PWA, 비교차트, 온보딩, 내보내기, 대시보드 커스텀, i18n) |
| 총 변경 파일 | ~35개 | 프론트엔드 ~28, 백엔드 ~7 |

### 1.2 기술 스택 추가

```
신규 의존성:
- web-push (백엔드: 푸시 알림 서버)
- vue-i18n@9 (프론트엔드: 다국어)
- @vueuse/core (이미 설치됨, useDraggable 활용)
- vite-plugin-pwa (PWA 빌드)
- xlsx (Excel 내보내기)
```

---

## 2. UI/UX 개선 상세 설계

### A-01: EmptyState 공통 컴포넌트

**신규 파일**: `frontend/src/components/common/EmptyState.vue`

```vue
<script setup lang="ts">
interface Props {
  icon?: string       // SVG 아이콘명 (plant, sensor, rule, alert, chart)
  title: string       // "아직 등록된 장비가 없습니다"
  description?: string // "장비를 등록하고 스마트팜을 시작하세요"
  actionLabel?: string // "장비 등록하기"
  actionTo?: string   // 라우터 경로 또는 emit
  steps?: { label: string; done: boolean }[] // 가이드 스텝
}
</script>
```

**디자인**:
```
┌─────────────────────────────────┐
│                                 │
│        🌱 (SVG 일러스트)        │
│                                 │
│   아직 등록된 장비가 없습니다      │
│   장비를 등록하고 스마트팜을       │
│   시작하세요                      │
│                                 │
│   ① 장비 등록 ─ ② 그룹 설정     │
│   ③ 환경 설정 ─ ④ 모니터링 시작  │
│                                 │
│       [ 장비 등록하기 ]           │
│                                 │
└─────────────────────────────────┘
```

**적용 페이지**:
| 페이지 | icon | title | actionLabel | actionTo |
|--------|------|-------|-------------|----------|
| Dashboard (데이터 없음) | plant | 스마트팜을 시작하세요 | 장비 등록하기 | /devices |
| Devices (장비 없음) | sensor | 등록된 장비가 없습니다 | Tuya 장비 동기화 | emit:sync |
| Groups (그룹 없음) | group | 그룹을 만들어보세요 | 그룹 추가 | emit:create |
| Sensors (센서 없음) | sensor | 센서가 등록된 그룹이 없습니다 | 장비 관리로 이동 | /devices |
| Automation (룰 없음) | rule | 자동화 룰이 없습니다 | 룰 추가 | emit:create |
| Alerts (알림 없음) | alert | 설정된 알림이 없습니다 | 알림 추가 | emit:create |
| Reports (데이터 없음) | chart | 표시할 데이터가 없습니다 | 기간 변경 | emit:filter |

**SVG 아이콘**: 인라인 SVG로 5종 작성 (농업 테마, --color-primary 활용)

---

### A-02: 모바일 리포트 레이아웃 개선

**변경 파일**: `frontend/src/views/Reports.vue`

**기간 선택 — 가로 스크롤 Chip**:
```
모바일 (< 768px):
┌──────────────────────────────────────┐
│ ◀ [12시간] [1일] [7일] [1개월] [📅] ▶ │  ← 가로 스크롤
└──────────────────────────────────────┘

CSS:
.period-selector {
  display: flex;
  overflow-x: auto;
  gap: 8px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;  /* 스크롤바 숨김 */
}
.period-chip {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 20px;
  white-space: nowrap;
}
```

**다운로드 버튼 — 아이콘 전용**:
```
모바일: 텍스트 "다운로드" → 아이콘 ⬇ (24x24, aria-label="다운로드")
데스크톱: 기존 텍스트 버튼 유지
```

**차트 — 전체 너비 확장**:
```css
@media (max-width: 768px) {
  .chart-container {
    width: 100%;
    height: 250px;        /* 고정 높이 */
    padding: 0;
    margin: 0 -16px;      /* 패딩 상쇄로 full-bleed */
    width: calc(100% + 32px);
  }
}
```

**테이블 → 카드형 리스트** (모바일 전용):
```
데스크톱: 기존 테이블 유지
모바일:
┌─────────────────────────┐
│ 2026-03-27 14:00        │
│ 온도 24.5°C │ 습도 65%  │
│ CO₂ 420ppm │ 조도 850lx │
└─────────────────────────┘
```

---

### A-03: 장비 카드 디자인 통일

**변경 파일**: `frontend/src/views/Devices.vue`

**통일 카드 레이아웃**:
```
┌─────────────────────────────────────┐
│ [아이콘] 석문리 왼쪽2동 휀      🟢  │  ← 타입 아이콘 + 이름 + 상태 dot
│ 환풍기 · 그룹: 육묘장               │  ← 타입 라벨 + 그룹
├─────────────────────────────────────┤
│                                     │
│  현재 상태: 가동 중 (ON)            │  ← 센서는 수치 표시
│                                     │
│  [ 제어 토글 ──────●── ]            │  ← 액추에이터만
│                                     │
└─────────────────────────────────────┘
```

**타입별 액센트 컬러**:
```css
--device-fan: #2196f3;        /* 파랑 */
--device-opener: #ff9800;     /* 주황 */
--device-irrigation: #00bcd4; /* 청록 */
--device-sensor: #9c27b0;     /* 보라 */
--device-other: #607d8b;      /* 회색 */
```

**카드 헤더에 2px 상단 보더**로 타입 구분:
```css
.device-card[data-type="fan"] { border-top: 3px solid var(--device-fan); }
.device-card[data-type="sensor"] { border-top: 3px solid var(--device-sensor); }
```

---

### A-04: 터치 타겟 & 접근성 개선

**변경 파일**: `frontend/src/style.css` (글로벌) + 개별 컴포넌트

**글로벌 CSS 추가**:
```css
/* 최소 터치 타겟 */
button, a, [role="button"], .clickable {
  min-height: 44px;
  min-width: 44px;
}

/* 포커스 인디케이터 */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* 스크린리더 전용 텍스트 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

**아이콘 버튼 aria-label 추가 대상**:
| 컴포넌트 | 아이콘 | aria-label |
|----------|--------|------------|
| Groups.vue | ⚙ 톱니바퀴 | "환경 설정" |
| Groups.vue | + 플러스 | "장비 추가" |
| Groups.vue | 🗑 휴지통 | "그룹 삭제" |
| Groups.vue | ▼ 필터 | "장비 필터" |
| Devices.vue | 동기화 아이콘 | "Tuya 장비 동기화" |
| Alerts.vue | 편집 아이콘 | "알림 설정 편집" |

**tooltip 구현**: CSS-only tooltip (title 속성 + 커스텀 ::after)
```css
[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: var(--color-text-primary);
  color: var(--color-bg);
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
```

---

### A-05: 환경 모니터링 접이식 UI

**변경 파일**: `frontend/src/views/Sensors.vue`

**모바일 레이아웃 변경**:
```
현재: 모든 섹션 펼침 (3868px 스크롤)
변경: 종합 점수 상단 고정 + 아코디언

┌─────────────────────────────────┐
│ 방울토마토                       │
│ 종합 환경 점수: 46점 ⚠️          │  ← 항상 표시
│ [내부환경] [외부환경] [종합평가]   │  ← 탭 선택
├─────────────────────────────────┤
│ ▼ 온도  24.5°C  ✅ 적정          │  ← 접힘 상태: 요약만
│ ▼ 습도  78.3%   ⚠️ 높음         │
│ ▶ CO₂   420ppm  ✅ 적정          │  ← 펼침 시: 차트 + 상세
│   ┌──────────────────────┐      │
│   │   [미니 차트 24h]    │      │
│   │   적정 범위: 400-800 │      │
│   │   최근 변화: +15ppm  │      │
│   └──────────────────────┘      │
│ ▼ 조도  850lx   ✅ 적정          │
│ ▼ VPD   1.2kPa  ✅ 적정          │
└─────────────────────────────────┘
```

**데스크톱**: 기존 레이아웃 유지 (충분한 공간)

**구현 방식**:
```vue
<div v-for="metric in metrics" :key="metric.type" class="metric-accordion">
  <button class="metric-header" @click="toggle(metric.type)">
    <span class="metric-icon">{{ metric.icon }}</span>
    <span class="metric-label">{{ metric.label }}</span>
    <span class="metric-value">{{ metric.value }}{{ metric.unit }}</span>
    <span class="metric-badge" :class="metric.status">{{ metric.statusText }}</span>
    <span class="accordion-arrow" :class="{ open: isOpen(metric.type) }">▶</span>
  </button>
  <Transition name="accordion">
    <div v-if="isOpen(metric.type)" class="metric-detail">
      <!-- 미니 차트, 적정 범위, 변화율 등 -->
    </div>
  </Transition>
</div>
```

---

### A-06: 사이드바 하단 활용

**변경 파일**: `frontend/src/App.vue` (사이드바 영역)

**미니 상태 위젯**:
```
┌─────────────────┐
│ ...기존 메뉴...   │
│                  │
│ ─── 시스템 상태 ──│  ← divider + 라벨
│ 🟢 온라인 2/6    │
│ 🔔 알림 3건      │
│ ⚡ 룰 1/3 실행중  │
└─────────────────┘
```

---

## 3. 신규 기능 상세 설계

### B-01: 대시보드 위젯 커스터마이징

**변경 파일**:
- `frontend/src/views/Dashboard.vue`
- `frontend/src/composables/useDashboardLayout.ts` (신규)
- `frontend/src/stores/dashboard.store.ts` (신규)

**위젯 시스템 구조**:
```typescript
// useDashboardLayout.ts
interface DashboardWidget {
  id: string
  type: 'weather' | 'summary' | 'devices' | 'sensors' | 'automation' | 'alerts' | 'harvest'
  title: string
  visible: boolean
  order: number
  size: 'sm' | 'md' | 'lg' | 'full'  // 그리드 크기
}

// 기본 레이아웃 (localStorage에 저장)
const defaultLayout: DashboardWidget[] = [
  { id: 'weather', type: 'weather', title: '날씨', visible: true, order: 0, size: 'full' },
  { id: 'summary', type: 'summary', title: '요약', visible: true, order: 1, size: 'full' },
  { id: 'devices', type: 'devices', title: '장비 현황', visible: true, order: 2, size: 'md' },
  { id: 'sensors', type: 'sensors', title: '센서 현황', visible: true, order: 3, size: 'md' },
  { id: 'automation', type: 'automation', title: '자동화 로그', visible: true, order: 4, size: 'lg' },
  { id: 'alerts', type: 'alerts', title: '최근 알림', visible: true, order: 5, size: 'md' },
  { id: 'harvest', type: 'harvest', title: '수확 일정', visible: true, order: 6, size: 'md' },
]
```

**편집 모드 UI**:
```
대시보드 헤더 우측: [⚙ 편집] 버튼

편집 모드:
┌─────────────────────────────────────────┐
│ 대시보드 편집                    [완료]  │
├─────────────────────────────────────────┤
│ ☑ 날씨         [═══════] full    ≡ 드래그│
│ ☑ 요약 카드    [═══════] full    ≡      │
│ ☑ 장비 현황    [════]   md       ≡      │
│ ☑ 센서 현황    [════]   md       ≡      │
│ ☐ 자동화 로그  [══════] lg       ≡      │  ← 체크 해제 = 숨김
│ ☑ 최근 알림    [════]   md       ≡      │
│ ☑ 수확 일정    [════]   md       ≡      │
└─────────────────────────────────────────┘
```

**저장**: `localStorage('sf-dashboard-layout')` — 사용자별 레이아웃 저장
**드래그**: 모바일은 드래그 대신 ↑↓ 버튼으로 순서 변경

---

### B-02: 알림 센터 + 웹 푸시 알림

> **웹에서 푸시 알림**: Web Push API + Service Worker를 사용하면 브라우저가 닫혀 있어도 알림 수신 가능. Chrome/Edge/Firefox 완벽 지원, iOS Safari는 PWA로 설치 시 지원 (16.4+).

#### 3.1 프론트엔드

**신규 파일**:
- `frontend/src/components/common/NotificationCenter.vue`
- `frontend/src/stores/notification-center.store.ts`
- `frontend/src/api/notification.api.ts`
- `frontend/public/sw.js` (Service Worker)

**알림 센터 UI**:
```
헤더 우측: 🔔 (빨간 뱃지 3)

클릭 시 드롭다운:
┌──────────────────────────────────┐
│ 알림               모두 읽음 처리 │
├──────────────────────────────────┤
│ 🔴 온도 임계값 초과              │
│   육묘장 온도 38.5°C (상한 35°C) │
│   2분 전                         │
├──────────────────────────────────┤
│ 🟡 장비 오프라인                  │
│   석문리 휀 #2 연결 끊김          │
│   15분 전                        │
├──────────────────────────────────┤
│ 🟢 자동화 실행 완료               │
│   "고온 환기" 룰 실행 성공        │
│   1시간 전                       │
├──────────────────────────────────┤
│        [ 전체 알림 보기 → ]       │
└──────────────────────────────────┘
```

**알림 타입**:
```typescript
interface AppNotification {
  id: string
  type: 'sensor_alert' | 'device_offline' | 'device_online' | 'automation_executed' | 'automation_failed' | 'system'
  title: string
  message: string
  severity: 'critical' | 'warning' | 'info' | 'success'
  read: boolean
  createdAt: string
  metadata?: {
    deviceId?: string
    ruleId?: string
    sensorType?: string
    value?: number
    threshold?: number
  }
}
```

**Store**:
```typescript
// notification-center.store.ts
export const useNotificationCenterStore = defineStore('notification-center', () => {
  const notifications = ref<AppNotification[]>([])
  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

  // 최근 50개만 유지
  function addNotification(notif: AppNotification) { ... }
  function markAsRead(id: string) { ... }
  function markAllAsRead() { ... }
  async function fetchNotifications() { ... }  // GET /api/notifications
  async function requestPushPermission() { ... } // Web Push 구독

  return { notifications, unreadCount, addNotification, markAsRead, markAllAsRead, fetchNotifications, requestPushPermission }
})
```

#### 3.2 백엔드

**변경 파일**:
- `backend/src/modules/notifications/notifications.module.ts` (확장)
- `backend/src/modules/notifications/notifications.service.ts` (신규)
- `backend/src/modules/notifications/notifications.controller.ts` (신규)
- `backend/src/modules/notifications/entities/notification.entity.ts` (신규)

**DB 엔티티**:
```typescript
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column() userId: string
  @Column() type: string        // sensor_alert, device_offline, ...
  @Column() title: string
  @Column() message: string
  @Column() severity: string    // critical, warning, info, success
  @Column({ default: false }) read: boolean
  @Column('jsonb', { nullable: true }) metadata: Record<string, any>
  @CreateDateColumn() createdAt: Date

  @Index() // userId + createdAt 복합 인덱스
}
```

**API**:
```
GET    /api/notifications?page=1&limit=20      // 알림 목록
PATCH  /api/notifications/:id/read              // 읽음 처리
PATCH  /api/notifications/read-all              // 전체 읽음
DELETE /api/notifications/:id                    // 삭제
POST   /api/notifications/push-subscribe         // 웹 푸시 구독 등록
```

**WebSocket 연동**:
기존 `notification:new` 이벤트를 활용, 알림 생성 시 DB 저장 + WebSocket 브로드캐스트 + Web Push 전송

**Web Push 흐름**:
```
1. 프론트: Service Worker 등록 → Push 구독 요청 → 구독 정보(endpoint, keys) 서버 전송
2. 백엔드: 구독 정보 DB 저장
3. 이벤트 발생 시: DB 저장 + WebSocket 전송 + web-push 라이브러리로 Push 전송
4. Service Worker: push 이벤트 수신 → Notification API로 시스템 알림 표시
```

---

### B-03: 자동화 실행 로그 & 히스토리

> **이미 존재**: `automation_logs` 테이블 + `AutomationLog` 엔티티 + `getLogs()` API가 구현되어 있음!
> 프론트엔드 UI만 추가하면 됨.

**신규 파일**:
- `frontend/src/components/automation/AutomationLogTimeline.vue`
- `frontend/src/api/automation-log.api.ts`

**자동화 페이지에 탭 추가**:
```
현재: [자동화 룰 목록]
변경: [룰 목록] [실행 로그] ← 탭 추가

실행 로그 탭:
┌──────────────────────────────────────────┐
│ 실행 로그         [오늘 ▼] [필터 ▼]      │
├──────────────────────────────────────────┤
│ 🟢 14:32  "고온 환기" 실행 성공           │
│   조건: 온도 35.2°C > 임계값 33°C        │
│   동작: 육묘장 휀 #1 ON                  │
│                                          │
│ 🔴 14:15  "관수 스케줄" 실행 실패         │
│   조건: 시간 14:00 도달                   │
│   오류: 장비 오프라인 (관수 밸브)          │
│                                          │
│ 🟢 13:00  "개폐기 자동" 실행 성공         │
│   조건: 온도 28°C & 습도 70%             │
│   동작: 개폐기 OPEN                      │
│                                          │
│        [ 더보기 (페이지 2) ]              │
└──────────────────────────────────────────┘
```

**API 호출**: 기존 `GET /api/automation/logs?page=1&limit=20` 활용

**통계 미니 카드** (상단):
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│ 오늘 실행 │ │ 성공률    │ │ 가장 활발 │
│    12회   │ │   92%    │ │ 고온 환기  │
└──────────┘ └──────────┘ └──────────┘
```

---

### B-04: 센서 데이터 비교 뷰

**신규 파일**:
- `frontend/src/components/reports/SensorCompareChart.vue`

**위치**: Reports.vue에 "비교" 탭 추가

```
[센서 데이터] [비교 분석] ← 탭 추가

비교 분석:
┌──────────────────────────────────────────┐
│ 비교 대상 선택:                           │
│ [그룹1: 육묘장 ▼] vs [그룹2: 1동 ▼]     │
│ [항목: 온도 ▼]  [기간: 7일 ▼]            │
├──────────────────────────────────────────┤
│                                          │
│  ───── 육묘장 (평균 25.3°C)              │
│  - - - 1동 (평균 23.1°C)                │
│  [오버레이 차트]                          │
│                                          │
├──────────────────────────────────────────┤
│ 통계 비교:                               │
│ 육묘장: 평균 25.3 / 최고 32.1 / 최저 18.5│
│ 1동:    평균 23.1 / 최고 29.8 / 최저 17.2│
│ 차이:   +2.2°C (육묘장이 평균 높음)       │
└──────────────────────────────────────────┘
```

**Chart.js 구현**: 기존 차트 컴포넌트에 2번째 dataset 추가 (다른 색상 + 점선)

---

### B-05: PWA 최적화

**신규/변경 파일**:
- `frontend/public/manifest.json` (신규)
- `frontend/public/sw.js` (신규 — B-02와 공유)
- `frontend/vite.config.ts` (PWA 플러그인 추가)
- `frontend/public/icons/` (앱 아이콘 세트)
- `frontend/index.html` (manifest 링크 추가)

**manifest.json**:
```json
{
  "name": "스마트팜 플랫폼",
  "short_name": "스마트팜",
  "description": "IoT 기반 스마트 농업 관리 시스템",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#f5f7fa",
  "theme_color": "#2e7d32",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Service Worker 전략**:
- **Network-first**: API 요청 (항상 최신 데이터)
- **Cache-first**: 정적 에셋 (JS, CSS, 이미지)
- **오프라인 폴백**: 마지막 동기화 대시보드 데이터 표시 + "오프라인 모드" 배너

**vite-plugin-pwa 설정**:
```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.json 사용
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 50 } }
          }
        ]
      }
    })
  ]
})
```

---

### B-06: 온보딩 투어

**신규 파일**:
- `frontend/src/composables/useOnboardingTour.ts`
- `frontend/src/components/common/TourOverlay.vue`

**구현 방식**: 외부 라이브러리 없이 자체 구현 (경량)

```typescript
// useOnboardingTour.ts
interface TourStep {
  target: string      // CSS 선택자
  title: string
  content: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

const dashboardTour: TourStep[] = [
  { target: '.weather-card', title: '날씨 정보', content: '현재 농장 날씨를 확인하세요', position: 'bottom' },
  { target: '.summary-cards', title: '요약 현황', content: '전체 장비, 그룹, 자동화 현황을 한눈에', position: 'bottom' },
  { target: '.sidebar-nav', title: '메뉴 탐색', content: '장비 관리, 그룹 설정, 자동화 등을 설정하세요', position: 'right' },
  { target: '.notification-bell', title: '알림', content: '센서 이상, 장비 상태 변화를 실시간으로 확인', position: 'bottom' },
]
```

**TourOverlay 디자인**:
```
┌─────────────────────────────────────────────┐
│ (어두운 오버레이, 타겟 요소만 하이라이트)      │
│                                              │
│     ┌─── 타겟 요소 (구멍 뚫림) ───┐          │
│     │   [날씨 카드 콘텐츠]         │          │
│     └─────────────────────────────┘          │
│            ↓                                 │
│     ┌──────────────────────┐                 │
│     │ 날씨 정보 (1/4)      │                 │
│     │ 현재 농장 날씨를      │                 │
│     │ 확인하세요            │                 │
│     │ [건너뛰기]  [다음 →]  │                 │
│     └──────────────────────┘                 │
└─────────────────────────────────────────────┘
```

**트리거**: 첫 로그인 시 자동 (localStorage `sf-tour-completed`로 1회만) + 사이드바 "가이드 투어" 메뉴

---

### B-07: 다국어(i18n) 기반 마련

**신규 파일**:
- `frontend/src/i18n/index.ts` (vue-i18n 설정)
- `frontend/src/i18n/locales/ko.ts` (한국어)
- `frontend/src/i18n/locales/en.ts` (영어)

**설정**:
```typescript
// i18n/index.ts
import { createI18n } from 'vue-i18n'
import ko from './locales/ko'
import en from './locales/en'

export const i18n = createI18n({
  legacy: false,       // Composition API
  locale: localStorage.getItem('sf-locale') || 'ko',
  fallbackLocale: 'ko',
  messages: { ko, en }
})
```

**메시지 구조 (ko.ts)**:
```typescript
export default {
  common: {
    save: '저장',
    cancel: '취소',
    delete: '삭제',
    edit: '수정',
    add: '추가',
    confirm: '확인',
    search: '검색',
    loading: '로딩 중...',
    noData: '데이터가 없습니다',
  },
  nav: {
    dashboard: '대시보드',
    devices: '장비 관리',
    groups: '그룹 관리',
    automation: '자동화 룰',
    sensors: '환경 모니터링',
    reports: '리포트 및 통계',
    harvest: '수확 관리',
    alerts: '센서 알림',
    users: '사용자 관리',
  },
  device: {
    action: {
      open: '열기',
      close: '닫기',
      on: '켜기',
      off: '끄기',
    }
  },
  // ... 점진적으로 확장
}
```

**1차 범위**: 네비게이션, 공통 버튼, 자동화 동작명(m-07 해결), 빈 상태 메시지
**적용**: `{{ t('nav.dashboard') }}` 형식으로 점진적 전환 (기존 하드코딩 유지 가능)
**언어 전환**: 사이드바 하단 글자크기 옆에 🌐 아이콘 추가

---

### B-08: 데이터 내보내기 강화

**변경 파일**:
- `frontend/src/views/Reports.vue` (내보내기 옵션 확장)
- `frontend/src/utils/export.ts` (신규)
- `backend/src/modules/reports/reports.service.ts` (벌크 다운로드 API)

**내보내기 옵션 UI**:
```
기존: [다운로드 ▼]
변경: [내보내기 ▼]
      ┌──────────────────┐
      │ 📊 CSV 내보내기   │
      │ 📗 Excel 내보내기 │
      │ 📄 PDF 리포트     │
      │ 📦 벌크 다운로드   │
      └──────────────────┘
```

**각 형식별 구현**:

| 형식 | 구현 방식 | 내용 |
|------|-----------|------|
| CSV | 프론트엔드 생성 | 현재 조회 데이터 → CSV 문자열 → Blob 다운로드 |
| Excel | `xlsx` 라이브러리 | 시트별 분리 (센서/통계/차트 데이터), 셀 서식 |
| PDF | 백엔드 생성 | 주간/월간 요약 리포트 (차트 이미지 포함) |
| 벌크 | 백엔드 API | 기간별 전체 센서 데이터 CSV (대용량) |

**Excel 유틸 (export.ts)**:
```typescript
import * as XLSX from 'xlsx'

export function exportToExcel(data: SensorDataPoint[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data.map(d => ({
    '시간': d.time,
    '센서': d.sensorType,
    '값': d.value,
    '단위': d.unit,
    '상태': d.status
  })))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '센서 데이터')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
```

**벌크 다운로드 API**:
```
GET /api/reports/export/bulk?groupId=xxx&from=2026-03-01&to=2026-03-27&format=csv
→ 스트리밍 응답 (Content-Type: text/csv, Content-Disposition: attachment)
```

---

## 4. 구현 순서

### Phase 1: 기반 작업 (공통 컴포넌트 + 인프라)
```
1. EmptyState.vue 공통 컴포넌트 생성 (A-01)
2. 글로벌 접근성 CSS 추가 (A-04)
3. i18n 기초 설정 + 메시지 파일 (B-07)
4. PWA manifest + Service Worker 기초 (B-05)
5. 알림 엔티티 + API 기초 (B-02 백엔드)
```

### Phase 2: 페이지별 UI/UX 개선
```
6. 각 페이지에 EmptyState 적용 (A-01 적용)
7. 모바일 리포트 레이아웃 개선 (A-02)
8. 장비 카드 디자인 통일 (A-03)
9. 환경 모니터링 접이식 UI (A-05)
10. 사이드바 하단 위젯 (A-06)
11. 아이콘 버튼 aria-label + tooltip (A-04 적용)
```

### Phase 3: 핵심 신규 기능
```
12. 알림 센터 프론트엔드 UI (B-02)
13. 알림 센터 WebSocket 연동 (B-02)
14. Web Push 구독 + Service Worker push 핸들러 (B-02 + B-05)
15. 자동화 실행 로그 UI (B-03)
16. 센서 비교 차트 (B-04)
```

### Phase 4: 고급 기능
```
17. 대시보드 위젯 커스터마이징 (B-01)
18. 온보딩 투어 (B-06)
19. 데이터 내보내기 강화 (B-08)
20. i18n 점진 적용 — 네비게이션, 공통 버튼, 자동화 동작명 (B-07 적용)
```

---

## 5. 파일 변경 매트릭스

### 신규 파일 (12개)
| 파일 | 기능 |
|------|------|
| `frontend/src/components/common/EmptyState.vue` | 빈 상태 공통 컴포넌트 |
| `frontend/src/components/common/NotificationCenter.vue` | 알림 센터 |
| `frontend/src/components/common/TourOverlay.vue` | 온보딩 투어 |
| `frontend/src/components/automation/AutomationLogTimeline.vue` | 자동화 로그 |
| `frontend/src/components/reports/SensorCompareChart.vue` | 센서 비교 차트 |
| `frontend/src/composables/useDashboardLayout.ts` | 대시보드 레이아웃 |
| `frontend/src/composables/useOnboardingTour.ts` | 온보딩 투어 로직 |
| `frontend/src/stores/notification-center.store.ts` | 알림 센터 스토어 |
| `frontend/src/api/notification.api.ts` | 알림 API |
| `frontend/src/api/automation-log.api.ts` | 자동화 로그 API |
| `frontend/src/utils/export.ts` | 내보내기 유틸 |
| `frontend/src/i18n/index.ts` + `locales/ko.ts` + `locales/en.ts` | 다국어 |
| `frontend/public/manifest.json` | PWA 매니페스트 |
| `frontend/public/sw.js` | Service Worker |

### 변경 파일 (15개+)
| 파일 | 변경 내용 |
|------|-----------|
| `frontend/src/style.css` | 접근성 CSS, 터치 타겟, tooltip |
| `frontend/src/App.vue` | 사이드바 위젯, 알림 벨, i18n |
| `frontend/src/main.ts` | i18n 플러그인 등록 |
| `frontend/src/views/Dashboard.vue` | EmptyState, 위젯 커스텀 |
| `frontend/src/views/Devices.vue` | 카드 통일, EmptyState |
| `frontend/src/views/Groups.vue` | EmptyState, aria-label |
| `frontend/src/views/Sensors.vue` | 접이식 UI, EmptyState |
| `frontend/src/views/Reports.vue` | 모바일 개선, 비교 탭, 내보내기 |
| `frontend/src/views/Automation.vue` | 로그 탭, EmptyState |
| `frontend/src/views/Alerts.vue` | EmptyState |
| `frontend/src/composables/useWebSocket.ts` | 알림 이벤트 연동 |
| `frontend/vite.config.ts` | PWA 플러그인 |
| `frontend/index.html` | manifest 링크, Service Worker 등록 |
| `frontend/package.json` | 신규 의존성 |
| `backend/src/modules/notifications/*` | 알림 서비스/컨트롤러/엔티티 |
| `backend/src/modules/reports/reports.service.ts` | 벌크 내보내기 |

---

## 6. 의존성 추가

### 프론트엔드
```json
{
  "vue-i18n": "^9.9.0",
  "vite-plugin-pwa": "^0.19.0",
  "xlsx": "^0.18.5"
}
```

### 백엔드
```json
{
  "web-push": "^3.6.7",
  "@types/web-push": "^3.6.3"
}
```

---

## 7. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 접근성 | WCAG 2.1 AA 수준 (터치 타겟 44px, focus-visible, aria-label) |
| 성능 | First Contentful Paint < 2s (PWA 캐싱) |
| 오프라인 | 마지막 대시보드 데이터 캐시 + "오프라인" 배너 |
| 반응형 | 모바일(375px) ~ 데스크톱(1440px) 완벽 지원 |
| 다크모드 | 모든 신규 컴포넌트 다크모드 지원 (CSS 변수 활용) |
| 브라우저 | Chrome 90+, Edge 90+, Firefox 90+, Safari 16+ |

---

*Generated by PDCA Design Phase — 2026-03-27*
