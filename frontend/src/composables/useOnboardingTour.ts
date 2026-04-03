import { ref } from 'vue'

interface TourStep {
  target: string // CSS selector
  title: string
  content: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

const TOUR_KEY = 'sf-tour-completed'

const isActive = ref(false)
const currentStepIndex = ref(0)
const steps = ref<TourStep[]>([])

const dashboardTour: TourStep[] = [
  {
    target: '.weather-card',
    title: '날씨 정보',
    content: '현재 농장 날씨를 확인하세요. 기상청 API에서 실시간으로 가져옵니다.',
    position: 'bottom',
  },
  {
    target: '.summary-cards-grid',
    title: '요약 현황',
    content: '전체 장치, 활성 그룹, 자동화 룰, 온라인 기기 현황을 한눈에 확인합니다.',
    position: 'bottom',
  },
  {
    target: '.sidebar-nav',
    title: '메뉴 탐색',
    content: '장치 관리, 그룹 설정, 자동화 룰, 환경 모니터링 등 각 기능을 이용하세요.',
    position: 'right',
  },
  {
    target: '.notification-bell',
    title: '알림',
    content: '센서 이상, 장치 상태 변화, 자동화 실행 결과를 실시간으로 확인합니다.',
    position: 'bottom',
  },
]

export function useOnboardingTour() {
  function startTour(tourSteps?: TourStep[]) {
    steps.value = tourSteps || dashboardTour
    currentStepIndex.value = 0
    isActive.value = true
  }

  function nextStep() {
    if (currentStepIndex.value < steps.value.length - 1) {
      currentStepIndex.value++
    } else {
      finishTour()
    }
  }

  function prevStep() {
    if (currentStepIndex.value > 0) {
      currentStepIndex.value--
    }
  }

  function finishTour() {
    isActive.value = false
    localStorage.setItem(TOUR_KEY, 'true')
  }

  function skipTour() {
    finishTour()
  }

  function shouldShowTour(): boolean {
    return !localStorage.getItem(TOUR_KEY)
  }

  function resetTour() {
    localStorage.removeItem(TOUR_KEY)
  }

  function getCurrentStep(): TourStep | null {
    return steps.value[currentStepIndex.value] || null
  }

  function getTargetRect(): DOMRect | null {
    const step = getCurrentStep()
    if (!step) return null
    const el = document.querySelector(step.target)
    return el?.getBoundingClientRect() || null
  }

  return {
    isActive,
    currentStepIndex,
    steps,
    startTour,
    nextStep,
    prevStep,
    finishTour,
    skipTour,
    shouldShowTour,
    resetTour,
    getCurrentStep,
    getTargetRect,
  }
}
