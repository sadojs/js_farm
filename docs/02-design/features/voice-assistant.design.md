# voice-assistant Design

> 웹 내장 음성 어시스턴트 — 하이브리드 명령 파서 (규칙 + Claude Haiku 폴백)

## 1. 시스템 아키텍처

### 1.1 전체 흐름

```
┌──────────────────┐     ┌──────────────────────┐     ┌───────────────────┐
│   브라우저        │     │   NestJS 백엔드       │     │  기존 서비스        │
│                  │     │                      │     │                   │
│  🎙 마이크 버튼   │     │  VoiceModule         │     │  DevicesService   │
│  Web Speech API  │────▶│  ├ VoiceController   │────▶│  AutomationService│
│  (STT, 무료)     │     │  ├ VoiceService      │     │  DashboardService │
│                  │◀────│  ├ CommandParser     │◀────│                   │
│  🔊 TTS (무료)   │     │  └ ClaudeNluService  │     │                   │
│                  │     │     (Haiku 폴백)      │     │                   │
└──────────────────┘     └──────────────────────┘     └───────────────────┘
```

### 1.2 하이브리드 파서 플로우

```
음성 텍스트 수신
  │
  ├─ 1단계: 규칙 기반 파서 (무료, <1ms)
  │   ├─ 매칭 성공 → 바로 실행
  │   └─ 매칭 실패 ↓
  │
  └─ 2단계: Claude Haiku API (약 0.3원/건, ~500ms)
      ├─ Function calling으로 구조화된 명령 추출
      └─ 실행 + 자연어 응답 생성
```

## 2. 파일 구조 (독립 모듈)

### 백엔드

```
backend/src/modules/voice/
├── voice.module.ts           ← 모듈 정의 (독립, 삭제 시 이것만 제거)
├── voice.controller.ts       ← POST /api/voice/command 엔드포인트
├── voice.service.ts          ← 명령 실행 오케스트레이터
├── command-parser.service.ts ← 규칙 기반 파서 (1단계)
└── claude-nlu.service.ts     ← Claude Haiku 폴백 (2단계)
```

### 프론트엔드

```
frontend/src/modules/voice-assistant/
├── VoiceAssistant.vue        ← 플로팅 버튼 + 대화 패널 UI
├── useVoiceRecognition.ts    ← Web Speech API 래퍼 (STT/TTS)
└── useVoiceCommands.ts       ← API 호출 + 대화 상태 관리
```

### 수정 파일

```
backend/src/app.module.ts     ← VoiceModule import 추가 (1줄)
frontend/src/App.vue          ← VoiceAssistant 컴포넌트 추가 (2줄)
```

### 삭제 방법
```bash
# 전체 삭제 시
rm -rf backend/src/modules/voice/
rm -rf frontend/src/modules/voice-assistant/
# + app.module.ts에서 VoiceModule 1줄 제거
# + App.vue에서 VoiceAssistant 2줄 제거
```

## 3. 백엔드 상세 설계

### 3.1 VoiceController

```typescript
@Controller('voice')
export class VoiceController {

  @Post('command')
  @UseGuards(JwtAuthGuard)
  async handleCommand(
    @Req() req,
    @Body() body: { text: string },
  ): Promise<VoiceResponse> {
    // req.user에서 userId, role, parentUserId 추출
    // → voiceService.execute(user, text)
  }
}

// 응답 타입
interface VoiceResponse {
  success: boolean;
  speech: string;       // TTS로 읽어줄 텍스트
  action?: string;      // 실행된 동작 (control, weather, automation 등)
  data?: any;           // 추가 데이터 (날씨 정보, 장치 상태 등)
  parsedBy: 'rule' | 'claude';  // 어떤 파서가 처리했는지
}
```

### 3.2 VoiceService (오케스트레이터)

```typescript
@Injectable()
export class VoiceService {
  constructor(
    private commandParser: CommandParserService,
    private claudeNlu: ClaudeNluService,
    private usersService: UsersService,
    private devicesService: DevicesService,
    private automationService: AutomationService,
    private dashboardService: DashboardService,
  ) {}

  async execute(user: AuthUser, text: string): Promise<VoiceResponse>
  // 1. effectiveUserId = usersService.getEffectiveUserId(user)
  // 2. parsed = commandParser.parse(text)
  // 3. if (parsed.action !== 'unknown') → executeCommand(parsed) [규칙 매칭]
  // 4. else → claudeNlu.parse(text, context) → executeCommand() [Haiku 폴백]
  // 5. 결과를 자연어 응답(speech)으로 변환하여 반환

  private async executeCommand(
    effectiveUserId: string,
    parsed: ParsedCommand,
  ): Promise<{ success: boolean; speech: string; data?: any }>
  // parsed.action에 따라 분기:
  //
  // 'control' → 장치 제어
  //   1. devicesService.findAllByUser(effectiveUserId)
  //   2. parsed.deviceName + parsed.groupName으로 장치 검색
  //   3. devicesService.controlDevice(id, effectiveUserId, commands)
  //   4. speech: "1동 팬을 켰습니다"
  //
  // 'weather' → 날씨 조회
  //   1. dashboardService.getWeatherForUser(effectiveUserId)
  //   2. speech: "현재 온도 18.5도, 습도 65%입니다"
  //
  // 'device_status' → 장치 상태
  //   1. devicesService.findAllByUser(effectiveUserId)
  //   2. actuator 장치들의 online/offline 상태 집계
  //   3. speech: "팬 2개 켜짐, 관수 꺼짐, 개폐기 닫힘"
  //
  // 'automation_list' → 자동화 목록
  //   1. automationService.findAll(effectiveUserId)
  //   2. speech: "환기 룰 활성, 관수 룰 비활성 등 3개 룰이 있습니다"
  //
  // 'automation_toggle' → 자동화 토글
  //   1. 이름으로 룰 검색
  //   2. automationService.toggle(ruleId, effectiveUserId)
  //   3. speech: "환기 룰을 활성화했습니다"
  //
  // 'automation_run' → 자동화 즉시 실행
  //   1. automationService.runRuleNow(ruleId, effectiveUserId)
  //   2. speech: "환기 룰을 실행했습니다"
}
```

### 3.3 CommandParserService (규칙 기반 — 1단계)

```typescript
@Injectable()
export class CommandParserService {

  parse(text: string): ParsedCommand
  // 핵심: 조사/어미를 제거하고 키워드만 추출
  //
  // 1. 노이즈 제거 (전처리)
  //    제거 대상: 좀, 을, 를, 이, 가, 에, 도, 은, 는, 요, 주세요, 줘, 줄래,
  //              해줘, 해, 할래, 합시다, 하자, 해라, 것 같은데, 인데
  //    "1동 환풍기 좀 틀어줄래" → "1동 환풍기 틀어"
  //
  // 2. 장치 제어 패턴 매칭
  //    ON: 켜, 시작, 작동, 틀어, on, 돌려
  //    OFF: 꺼, 중지, 정지, 멈춰, off, 끄
  //    OPEN: 열어, 열림, 열기, open
  //    CLOSE: 닫아, 닫힘, 닫기, close
  //    장치: 팬/환풍기/환기, 관수/물/워터, 개폐기
  //    그룹: N동, N번
  //
  // 3. 날씨/상태 패턴
  //    날씨, 기온, 온도, 습도, 비 → 'weather'
  //    장치, 상태, 뭐 켜져 → 'device_status'
  //
  // 4. 자동화 패턴
  //    자동화/룰/스케줄 + 목록/리스트 → 'automation_list'
  //    자동화 + ON키워드 + 이름 → 'automation_toggle'
  //    자동화 + 실행 + 이름 → 'automation_run'
  //
  // 5. 매칭 실패 → { action: 'unknown' }
}

interface ParsedCommand {
  action: 'control' | 'weather' | 'device_status'
        | 'automation_list' | 'automation_toggle' | 'automation_run'
        | 'unknown';
  deviceName?: string;
  command?: 'on' | 'off' | 'open' | 'close';
  groupName?: string;
  ruleName?: string;
  enabled?: boolean;
  rawText: string;
  confidence: 'high' | 'low';  // 규칙 매칭 확신도
}
```

### 3.4 ClaudeNluService (Haiku 폴백 — 2단계)

```typescript
@Injectable()
export class ClaudeNluService {
  private client: Anthropic;

  constructor(private configService: ConfigService) {
    const apiKey = configService.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async parse(text: string, context: DeviceContext): Promise<ParsedCommand>
  // Claude Haiku에 function calling으로 요청
  //
  // model: 'claude-haiku-4-5-20251001'
  //
  // system prompt:
  //   "스마트팜 음성 명령을 해석합니다.
  //    사용자의 장치 목록: {context.devices}
  //    자동화 룰 목록: {context.rules}
  //    반드시 tool_use로 응답하세요."
  //
  // tools 정의:
  //   control_device:
  //     deviceId: string (장치 ID)
  //     command: 'on' | 'off' | 'open' | 'close'
  //
  //   get_weather: {} (파라미터 없음)
  //
  //   get_device_status: {} (파라미터 없음)
  //
  //   list_automation: {} (파라미터 없음)
  //
  //   toggle_automation:
  //     ruleId: string
  //     enabled: boolean
  //
  //   run_automation:
  //     ruleId: string
  //
  //   unknown:
  //     message: string (이해 못한 경우 안내 메시지)
  //
  // 장점: 장치 이름/ID를 직접 context로 전달하므로
  //        "환풍기" = "팬" 매핑을 Claude가 알아서 해결
  //        "비 올 것 같은데 닫아야 하나?" 같은 질문도 처리 가능

  isAvailable(): boolean
  // ANTHROPIC_API_KEY 설정 여부 확인
}

// Claude에 전달할 컨텍스트
interface DeviceContext {
  devices: Array<{ id: string; name: string; equipmentType: string; online: boolean }>;
  rules: Array<{ id: string; name: string; enabled: boolean }>;
}
```

### 3.5 VoiceModule

```typescript
@Module({
  imports: [
    UsersModule,
    DevicesModule,
    AutomationModule,
    DashboardModule,
  ],
  controllers: [VoiceController],
  providers: [VoiceService, CommandParserService, ClaudeNluService],
})
export class VoiceModule {}
```

## 4. 프론트엔드 상세 설계

### 4.1 useVoiceRecognition.ts

```typescript
// Web Speech API 래퍼
export function useVoiceRecognition() {

  const isSupported: boolean  // SpeechRecognition 지원 여부
  const isListening: Ref<boolean>
  const transcript: Ref<string>      // 인식된 텍스트
  const interimText: Ref<string>     // 중간 결과 (실시간)

  function startListening(): void
  // 1. SpeechRecognition 인스턴스 생성
  //    (window.SpeechRecognition || window.webkitSpeechRecognition)
  // 2. lang = 'ko-KR'
  // 3. interimResults = true (실시간 중간 결과)
  // 4. continuous = false (한 문장 인식 후 자동 종료)
  // 5. onresult → transcript 업데이트
  // 6. onerror → 에러 처리
  // 7. recognition.start()

  function stopListening(): void
  // recognition.stop()

  function speak(text: string): Promise<void>
  // 1. SpeechSynthesisUtterance 생성
  // 2. utterance.lang = 'ko-KR'
  // 3. utterance.rate = 1.1 (약간 빠르게)
  // 4. speechSynthesis.speak(utterance)
  // 5. Promise로 감싸서 끝날 때 resolve
  // 6. TTS 중에는 마이크 비활성화 (에코 방지)

  return { isSupported, isListening, transcript, interimText,
           startListening, stopListening, speak }
}
```

### 4.2 useVoiceCommands.ts

```typescript
export function useVoiceCommands() {

  const messages: Ref<ChatMessage[]>   // 대화 기록 (최근 10개)
  const isProcessing: Ref<boolean>

  async function sendCommand(text: string): Promise<void>
  // 1. messages에 사용자 메시지 추가 { role: 'user', text }
  // 2. isProcessing = true
  // 3. POST /api/voice/command { text } 호출
  // 4. 응답에서 speech 추출
  // 5. messages에 시스템 응답 추가 { role: 'assistant', text: speech }
  // 6. isProcessing = false
  // 7. speech 반환 (TTS용)

  function clearMessages(): void

  return { messages, isProcessing, sendCommand, clearMessages }
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  parsedBy?: 'rule' | 'claude';
}
```

### 4.3 VoiceAssistant.vue

```
┌────────────────────────────────┐
│        (현재 페이지 내용)        │
│                                │
│                          ┌───┐ │
│                          │ 🎙│ │  ← 플로팅 버튼 (z-index 높게)
│                          └───┘ │
│                                │
│ ┌────────────────────────────┐ │  ← 대화 패널 (마이크 탭 시 슬라이드업)
│ │  💬 대화 기록               │ │
│ │ ┌──────────────────┐      │ │
│ │ │ 🧑 "팬 켜줘"      │      │ │
│ │ └──────────────────┘      │ │
│ │ ┌──────────────────┐      │ │
│ │ │ 🤖 "1동 팬을 켰습니다" │ │ │
│ │ └──────────────────┘      │ │
│ │                           │ │
│ │ ┌─────────────────────┐   │ │
│ │ │ 🎙 듣고 있습니다...   │   │ │  ← 음성 인식 중 표시
│ │ │ "환풍기 좀..."       │   │ │  ← 중간 결과 실시간
│ │ └─────────────────────┘   │ │
│ │                           │ │
│ │ [텍스트 입력란]    [전송]   │ │  ← 텍스트 폴백
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

**컴포넌트 상태:**
- `panelOpen: boolean` — 대화 패널 표시 여부
- 플로팅 버튼 색상: 대기(기본) → 듣는 중(빨강 펄스) → 처리 중(로딩) → 완료(초록, 1초 후 기본)

**위치:**
- 플로팅 버튼: `position: fixed; right: 20px; bottom: 80px` (모바일 네비 위)
- 대화 패널: `position: fixed; bottom: 0; max-height: 60vh`

**텍스트 폴백:**
- `isSupported === false`이거나 마이크 권한 거부 시 텍스트 입력란 자동 포커스
- Enter 또는 전송 버튼으로 동일한 명령 파이프라인 실행

## 5. 권한 처리

```
모든 API 호출은 기존 JWT 토큰 기반
  │
  ├─ JwtAuthGuard로 인증 확인
  │
  ├─ req.user에서 userId, role, parentUserId 추출
  │
  └─ usersService.getEffectiveUserId(user) 호출
      ├─ admin → 자기 장치
      ├─ farm_admin → 자기 장치
      └─ farm_user → parentUserId(farm_admin)의 장치
```

**음성 어시스턴트 전용 로직 불필요** — 기존 서비스 레이어에서 이미 처리됨.

## 6. 환경 변수

```env
# .env에 추가 (Claude Haiku 폴백용)
ANTHROPIC_API_KEY=sk-ant-...

# 선택: Haiku가 없으면 규칙 기반만 동작 (서버 시작 차단 안 함)
```

## 7. 구현 순서

| 순서 | 항목 | 파일 | 의존성 |
|------|------|------|--------|
| 1 | CommandParserService | `voice/command-parser.service.ts` | 없음 |
| 2 | ClaudeNluService | `voice/claude-nlu.service.ts` | ANTHROPIC_API_KEY |
| 3 | VoiceService | `voice/voice.service.ts` | 1, 2 |
| 4 | VoiceController | `voice/voice.controller.ts` | 3 |
| 5 | VoiceModule + AppModule 등록 | `voice/voice.module.ts` | 1~4 |
| 6 | @anthropic-ai/sdk 설치 | `package.json` | 없음 |
| 7 | useVoiceRecognition | `voice-assistant/useVoiceRecognition.ts` | 없음 |
| 8 | useVoiceCommands | `voice-assistant/useVoiceCommands.ts` | 없음 |
| 9 | VoiceAssistant.vue | `voice-assistant/VoiceAssistant.vue` | 7, 8 |
| 10 | App.vue에 컴포넌트 추가 | `App.vue` | 9 |
| 11 | docker-compose 환경변수 | `docker-compose.yml` | 없음 |

## 8. 에러 처리

| 상황 | 응답 (speech) |
|------|---------------|
| 규칙+Claude 모두 이해 불가 | "죄송합니다, 명령을 이해하지 못했어요. 다시 말씀해주세요." |
| 장치 미발견 | "해당 장치를 찾을 수 없습니다." |
| 장치 오프라인 | "장치가 오프라인 상태입니다." |
| 장치 제어 실패 | "장치 제어에 실패했습니다." |
| ANTHROPIC_API_KEY 미설정 | 규칙 기반만 동작, 로그 경고 |
| Claude API 호출 실패 | "일시적인 오류가 발생했습니다. 다시 시도해주세요." |
| 마이크 권한 거부 | 텍스트 입력 모드로 전환 안내 |
| 브라우저 미지원 | 텍스트 입력 모드만 표시 |

## 9. Claude Haiku 프롬프트 설계

```
System:
너는 스마트팜 음성 명령을 해석하는 어시스턴트입니다.
사용자가 농장 장치를 제어하거나 정보를 요청합니다.
반드시 제공된 tool 중 하나를 사용하여 응답하세요.

사용자의 장치 목록:
{devices JSON}

자동화 룰 목록:
{rules JSON}

규칙:
- 장치 제어 요청이면 control_device 사용
- 날씨 질문이면 get_weather 사용
- 장치 상태 질문이면 get_device_status 사용
- 자동화 관련이면 해당 tool 사용
- 이해할 수 없으면 unknown 사용
- 응답은 간결하고 친근하게
```

## 10. 테스트 시나리오

| # | 음성 입력 | 파서 | 기대 동작 |
|---|----------|------|----------|
| T-01 | "팬 켜줘" | 규칙 | 팬 ON, "팬을 켰습니다" |
| T-02 | "1동 환풍기 좀 틀어줄래" | 규칙(전처리) | 1동 팬 ON |
| T-03 | "비 올 것 같은데 개폐기 닫아" | Claude | 개폐기 CLOSE + 날씨 정보 |
| T-04 | "지금 온도 몇 도야?" | 규칙 | 날씨 조회 |
| T-05 | "자동화 뭐 있어?" | 규칙 | 자동화 목록 응답 |
| T-06 | "환기 룰 좀 꺼줘" | 규칙 | 환기 룰 비활성화 |
| T-07 | "물 줘야 하나?" | Claude | 관수 상태 + 센서 데이터 기반 응답 |
| T-08 | "안녕" | Claude | unknown → 도움말 안내 |
| T-09 | 텍스트 "팬 켜줘" | 규칙 | 텍스트 폴백, 동일 동작 |
| T-10 | "전체 다 꺼" | Claude | 모든 actuator OFF |
