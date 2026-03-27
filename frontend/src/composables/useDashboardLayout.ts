import { ref, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export interface DashboardWidget {
  id: string
  type: 'weather' | 'summary' | 'devices' | 'sensors' | 'automation' | 'alerts' | 'harvest'
  title: string
  visible: boolean
  order: number
  size: 'sm' | 'md' | 'lg' | 'full'
}

const defaultLayout: DashboardWidget[] = [
  { id: 'weather', type: 'weather', title: '날씨', visible: true, order: 0, size: 'full' },
  { id: 'summary', type: 'summary', title: '요약 카드', visible: true, order: 1, size: 'full' },
  { id: 'devices', type: 'devices', title: '장비 현황', visible: true, order: 2, size: 'md' },
  { id: 'sensors', type: 'sensors', title: '센서 현황', visible: true, order: 3, size: 'md' },
  { id: 'automation', type: 'automation', title: '자동화 로그', visible: true, order: 4, size: 'lg' },
  { id: 'alerts', type: 'alerts', title: '최근 알림', visible: true, order: 5, size: 'md' },
  { id: 'harvest', type: 'harvest', title: '수확 일정', visible: true, order: 6, size: 'md' },
]

export function useDashboardLayout() {
  const layout = useLocalStorage<DashboardWidget[]>('sf-dashboard-layout', defaultLayout)
  const isEditMode = ref(false)

  // 레이아웃에 없는 새 위젯 추가 (업데이트 시)
  const existingIds = new Set(layout.value.map(w => w.id))
  for (const dw of defaultLayout) {
    if (!existingIds.has(dw.id)) {
      layout.value.push({ ...dw })
    }
  }

  const visibleWidgets = ref(
    layout.value
      .filter(w => w.visible)
      .sort((a, b) => a.order - b.order)
  )

  watch(layout, (newLayout) => {
    visibleWidgets.value = newLayout
      .filter(w => w.visible)
      .sort((a, b) => a.order - b.order)
  }, { deep: true })

  function toggleWidget(id: string) {
    const widget = layout.value.find(w => w.id === id)
    if (widget) widget.visible = !widget.visible
  }

  function moveWidget(id: string, direction: 'up' | 'down') {
    const idx = layout.value.findIndex(w => w.id === id)
    if (idx === -1) return

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= layout.value.length) return

    // Swap order
    const temp = layout.value[idx].order
    layout.value[idx].order = layout.value[targetIdx].order
    layout.value[targetIdx].order = temp

    // Sort
    layout.value.sort((a, b) => a.order - b.order)
  }

  function resetLayout() {
    layout.value = defaultLayout.map(w => ({ ...w }))
  }

  function enterEditMode() { isEditMode.value = true }
  function exitEditMode() { isEditMode.value = false }

  return {
    layout,
    visibleWidgets,
    isEditMode,
    toggleWidget,
    moveWidget,
    resetLayout,
    enterEditMode,
    exitEditMode,
  }
}
