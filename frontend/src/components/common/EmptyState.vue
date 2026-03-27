<template>
  <div class="empty-state-container">
    <div class="empty-illustration" v-html="iconSvg"></div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-description">{{ description }}</p>

    <!-- 가이드 스텝 -->
    <div v-if="steps && steps.length > 0" class="empty-steps">
      <div
        v-for="(step, idx) in steps"
        :key="idx"
        :class="['step-item', { done: step.done }]"
      >
        <span class="step-number">{{ step.done ? '✓' : idx + 1 }}</span>
        <span class="step-label">{{ step.label }}</span>
      </div>
    </div>

    <!-- CTA 버튼 -->
    <router-link v-if="actionTo && !isEmit" :to="actionTo" class="empty-action-btn">
      {{ actionLabel }}
    </router-link>
    <button v-else-if="actionLabel" class="empty-action-btn" @click="$emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Step {
  label: string
  done: boolean
}

const props = withDefaults(defineProps<{
  icon?: 'plant' | 'sensor' | 'group' | 'rule' | 'alert' | 'chart' | 'device'
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  steps?: Step[]
}>(), {
  icon: 'plant',
})

defineEmits<{ action: [] }>()

const isEmit = computed(() => props.actionTo?.startsWith('emit:') || !props.actionTo)

const icons: Record<string, string> = {
  plant: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="38" fill="var(--color-primary)" opacity="0.08"/>
    <path d="M40 58V38" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M40 38c-8-12-20-10-22-8s2 14 12 14" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round" fill="var(--color-primary)" opacity="0.15"/>
    <path d="M40 32c6-14 18-14 20-12s0 14-10 16" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round" fill="var(--color-primary)" opacity="0.15"/>
    <path d="M32 58h16" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  sensor: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="38" fill="var(--color-info)" opacity="0.08"/>
    <rect x="30" y="20" width="20" height="40" rx="4" stroke="var(--color-info)" stroke-width="2.5" fill="var(--color-info)" opacity="0.1"/>
    <circle cx="40" cy="34" r="6" stroke="var(--color-info)" stroke-width="2.5"/>
    <line x1="36" y1="48" x2="44" y2="48" stroke="var(--color-info)" stroke-width="2" stroke-linecap="round"/>
    <line x1="34" y1="52" x2="46" y2="52" stroke="var(--color-info)" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 34c-2-4-2-8 0-12" stroke="var(--color-info)" stroke-width="2" stroke-linecap="round"/>
    <path d="M56 34c2-4 2-8 0-12" stroke="var(--color-info)" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  group: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="38" fill="var(--color-primary)" opacity="0.08"/>
    <circle cx="32" cy="30" r="7" stroke="var(--color-primary)" stroke-width="2.5" fill="var(--color-primary)" opacity="0.1"/>
    <circle cx="50" cy="30" r="7" stroke="var(--color-primary)" stroke-width="2.5" fill="var(--color-primary)" opacity="0.1"/>
    <path d="M22 52c0-6 4-10 10-10h2" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M58 52c0-6-4-10-10-10h-2" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="40" cy="46" r="5" stroke="var(--color-primary)" stroke-width="2.5" fill="var(--color-primary)" opacity="0.15"/>
    <path d="M32 60c0-5 3-8 8-8s8 3 8 8" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  rule: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="38" fill="var(--color-warning)" opacity="0.08"/>
    <circle cx="40" cy="40" r="10" stroke="var(--color-warning)" stroke-width="2.5"/>
    <circle cx="40" cy="40" r="4" fill="var(--color-warning)"/>
    <path d="M40 24v6M40 50v6M24 40h6M50 40h6" stroke="var(--color-warning)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M29.5 29.5l4 4M46.5 46.5l4 4M29.5 50.5l4-4M46.5 33.5l4-4" stroke="var(--color-warning)" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  alert: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="38" fill="var(--color-error)" opacity="0.08"/>
    <path d="M40 22L18 58h44L40 22z" stroke="var(--color-error)" stroke-width="2.5" fill="var(--color-error)" opacity="0.1" stroke-linejoin="round"/>
    <line x1="40" y1="34" x2="40" y2="46" stroke="var(--color-error)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="40" cy="52" r="2" fill="var(--color-error)"/>
  </svg>`,
  chart: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="38" fill="var(--color-primary)" opacity="0.08"/>
    <rect x="20" y="44" width="8" height="16" rx="2" fill="var(--color-primary)" opacity="0.3"/>
    <rect x="32" y="32" width="8" height="28" rx="2" fill="var(--color-primary)" opacity="0.5"/>
    <rect x="44" y="38" width="8" height="22" rx="2" fill="var(--color-primary)" opacity="0.4"/>
    <rect x="56" y="26" width="8" height="34" rx="2" fill="var(--color-primary)" opacity="0.6"/>
    <path d="M18 62h46" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  device: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="38" fill="var(--color-info)" opacity="0.08"/>
    <rect x="24" y="22" width="32" height="36" rx="4" stroke="var(--color-info)" stroke-width="2.5" fill="var(--color-info)" opacity="0.1"/>
    <circle cx="40" cy="36" r="8" stroke="var(--color-info)" stroke-width="2.5"/>
    <path d="M36 36h8M40 32v8" stroke="var(--color-info)" stroke-width="2" stroke-linecap="round"/>
    <line x1="32" y1="50" x2="48" y2="50" stroke="var(--color-info)" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
}

const iconSvg = computed(() => icons[props.icon] || icons.plant)
</script>

<style scoped>
.empty-state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-illustration {
  width: 80px;
  height: 80px;
  margin-bottom: 20px;
}

.empty-illustration :deep(svg) {
  width: 100%;
  height: 100%;
}

.empty-title {
  font-size: calc(16px * var(--content-scale, 1));
  font-weight: 600;
  color: var(--text-primary, var(--color-text-primary));
  margin: 0 0 8px;
}

.empty-description {
  font-size: calc(14px * var(--content-scale, 1));
  color: var(--text-secondary, var(--color-text-secondary));
  margin: 0 0 20px;
  max-width: 320px;
  line-height: 1.5;
}

.empty-steps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-bottom: 24px;
  max-width: 480px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: calc(13px * var(--content-scale, 1));
  color: var(--text-secondary, var(--color-text-secondary));
}

.step-item.done {
  color: var(--color-success);
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-secondary, var(--color-border));
  color: var(--text-primary, var(--color-text-primary));
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-item.done .step-number {
  background: var(--color-success);
  color: #fff;
}

.empty-action-btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 24px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: calc(14px * var(--content-scale, 1));
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s;
}

.empty-action-btn:hover {
  background: var(--color-primary-dark);
}
</style>
