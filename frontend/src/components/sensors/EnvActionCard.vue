<template>
  <div class="env-action-card">
    <div class="env-action-label">환경 행동 권고</div>
    <div class="env-action-text">{{ actionText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { envActionFor } from '../../utils/sensor-labels'

const props = defineProps<{
  score: number
  worst: string
}>()

const actionText = computed(() => envActionFor(props.score, props.worst))
</script>
