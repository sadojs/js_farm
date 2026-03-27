<template>
  <Teleport to="body">
    <Transition name="tour-fade">
      <div v-if="tour.isActive.value" class="tour-overlay">
        <!-- 하이라이트 컷아웃 -->
        <svg class="tour-backdrop" viewBox="0 0 10000 10000" preserveAspectRatio="none">
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white"/>
              <rect
                v-if="highlightRect"
                :x="highlightRect.left - 6"
                :y="highlightRect.top - 6"
                :width="highlightRect.width + 12"
                :height="highlightRect.height + 12"
                rx="8"
                fill="black"
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#tour-mask)"/>
        </svg>

        <!-- 툴팁 -->
        <div
          v-if="currentStep"
          class="tour-tooltip"
          :style="tooltipStyle"
        >
          <div class="tour-tooltip-header">
            <span class="tour-step-badge">{{ tour.currentStepIndex.value + 1 }}/{{ tour.steps.value.length }}</span>
            <h4>{{ currentStep.title }}</h4>
          </div>
          <p class="tour-tooltip-content">{{ currentStep.content }}</p>
          <div class="tour-tooltip-actions">
            <button class="tour-btn-skip" @click="tour.skipTour()">건너뛰기</button>
            <div class="tour-btn-group">
              <button v-if="tour.currentStepIndex.value > 0" class="tour-btn-prev" @click="updateStep('prev')">이전</button>
              <button class="tour-btn-next" @click="updateStep('next')">
                {{ isLastStep ? '완료' : '다음 →' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useOnboardingTour } from '@/composables/useOnboardingTour'

const tour = useOnboardingTour()
const highlightRect = ref<DOMRect | null>(null)

const currentStep = computed(() => tour.getCurrentStep())
const isLastStep = computed(() => tour.currentStepIndex.value === tour.steps.value.length - 1)

const tooltipStyle = computed(() => {
  const rect = highlightRect.value
  if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  const step = currentStep.value
  if (!step) return {}

  const gap = 16
  switch (step.position) {
    case 'bottom':
      return { top: `${rect.bottom + gap}px`, left: `${rect.left + rect.width / 2}px`, transform: 'translateX(-50%)' }
    case 'top':
      return { bottom: `${window.innerHeight - rect.top + gap}px`, left: `${rect.left + rect.width / 2}px`, transform: 'translateX(-50%)' }
    case 'right':
      return { top: `${rect.top + rect.height / 2}px`, left: `${rect.right + gap}px`, transform: 'translateY(-50%)' }
    case 'left':
      return { top: `${rect.top + rect.height / 2}px`, right: `${window.innerWidth - rect.left + gap}px`, transform: 'translateY(-50%)' }
    default:
      return { top: `${rect.bottom + gap}px`, left: `${rect.left}px` }
  }
})

function updateHighlight() {
  highlightRect.value = tour.getTargetRect()
}

function updateStep(dir: 'next' | 'prev') {
  if (dir === 'next') tour.nextStep()
  else tour.prevStep()
  setTimeout(updateHighlight, 50)
}

watch(() => tour.isActive.value, (active) => {
  if (active) {
    setTimeout(updateHighlight, 100)
    window.addEventListener('resize', updateHighlight)
    window.addEventListener('scroll', updateHighlight)
  } else {
    window.removeEventListener('resize', updateHighlight)
    window.removeEventListener('scroll', updateHighlight)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', updateHighlight)
  window.removeEventListener('scroll', updateHighlight)
})
</script>

<style scoped>
.tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: none;
}

.tour-backdrop {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}

.tour-tooltip {
  position: fixed;
  background: #fff;
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  padding: 20px;
  width: 320px;
  max-width: calc(100vw - 32px);
  z-index: 10001;
  pointer-events: auto;
}

.tour-tooltip-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.tour-step-badge {
  background: var(--color-primary, #2e7d32);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}

.tour-tooltip-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.tour-tooltip-content {
  font-size: 14px;
  color: #555;
  line-height: 1.5;
  margin: 0 0 16px;
}

.tour-tooltip-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tour-btn-skip {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 13px;
  padding: 6px 0;
}

.tour-btn-group {
  display: flex;
  gap: 8px;
}

.tour-btn-prev {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}

.tour-btn-next {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary, #2e7d32);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.tour-fade-enter-active, .tour-fade-leave-active {
  transition: opacity 0.3s;
}
.tour-fade-enter-from, .tour-fade-leave-to {
  opacity: 0;
}
</style>
