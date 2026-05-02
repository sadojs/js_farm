import type { WizardStateV2 } from './types'
import type { CreateRuleRequest, ConditionGroup, IrrigationConditions } from '@/types/automation.types'
import { DEFAULT_CHANNEL_MAPPING_8CH, DEFAULT_CHANNEL_MAPPING_12CH } from '@/types/device.types'

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function buildIrrigation(state: WizardStateV2): CreateRuleRequest {
  const { groupId, ruleName, irrigation } = state
  if (!irrigation) throw new Error('irrigation state missing')

  const sched = irrigation.schedule[0]
  const mapping = irrigation.controllerChannels === 12
    ? DEFAULT_CHANNEL_MAPPING_12CH
    : DEFAULT_CHANNEL_MAPPING_8CH

  // 8CH → 4구역(zone_1~4), 12CH → 8구역(zone_1~8)
  const zoneCount = irrigation.controllerChannels === 12 ? 8 : 4
  const zones = Array.from({ length: zoneCount }, (_, i) => ({
    zone: i + 1,
    name: `${i + 1}번 밸브`,
    duration: irrigation.valveZones.includes(i + 1) ? irrigation.durationMin : 0,
    waitTime: irrigation.valveZones.includes(i + 1) ? irrigation.waitTimeBetweenZones : 0,
    enabled: irrigation.valveZones.includes(i + 1),
  }))

  const conditions: IrrigationConditions = {
    type: 'irrigation',
    startTime: sched?.startTime ?? '08:00',
    zones,
    mixer: { enabled: irrigation.mixerEnabled },
    fertilizer: irrigation.useFertilizer
      ? { enabled: true, duration: irrigation.fertilizer.duration, preStopWait: irrigation.fertilizer.preStopWait }
      : { enabled: false, duration: 0, preStopWait: 0 },
    schedule: { days: sched?.days ?? [1, 2, 3, 4, 5], repeat: true },
  }

  const meta: Record<string, unknown> = {}
  if (irrigation.schedule.length > 1) {
    meta.additionalSchedules = irrigation.schedule.slice(1)
  }
  meta.channelMapping = mapping

  return {
    name: ruleName,
    groupId: groupId ?? undefined,
    conditions,
    actions: {
      targetDeviceId: irrigation.controllerDeviceId,
      targetDeviceIds: [irrigation.controllerDeviceId],
      sensorDeviceIds: [],
    } as any,
    priority: 1,
    ...(Object.keys(meta).length ? { description: JSON.stringify(meta) } : {}),
  }
}

function buildOpenerFan(state: WizardStateV2): CreateRuleRequest {
  const { groupId, ruleName, intent } = state
  const trigger = intent === 'opener' ? state.opener : state.fan
  if (!trigger) throw new Error('trigger state missing')

  let conditions: ConditionGroup

  if (trigger.triggerType === 'time' && trigger.timeRange) {
    const baseCond: any = {
      type: 'time',
      field: 'time',
      operator: 'between',
      value: [toMinutes(trigger.timeRange.start), toMinutes(trigger.timeRange.end)] as [number, number],
      daysOfWeek: trigger.timeRange.days,
    }
    if (trigger.relayEnabled) {
      baseCond.relay = true
      baseCond.relayOnMinutes = trigger.relayOnMin
      baseCond.relayOffMinutes = trigger.relayOffMin
    }
    conditions = {
      logic: 'AND',
      groups: [{ logic: 'AND', conditions: [baseCond] }],
    }
  } else if (trigger.triggerType === 'temperature' && trigger.temperature) {
    const { base, hysteresis } = trigger.temperature
    const onAt = base + hysteresis
    const mainCond: any = {
      type: 'sensor' as const,
      field: 'temperature',
      operator: 'gte' as const,
      value: onAt,
      unit: '°C',
      deviation: hysteresis,
    }
    if (trigger.relayEnabled) {
      mainCond.relay = true
      mainCond.relayOnMinutes = trigger.relayOnMin
      mainCond.relayOffMinutes = trigger.relayOffMin
    }
    const extraConds = trigger.extraConditions.map(ec => ({
      type: 'sensor' as const,
      field: ec.field,
      operator: ec.operator,
      value: ec.value,
    }))
    conditions = {
      logic: 'AND',
      groups: [{ logic: 'AND', conditions: [mainCond, ...extraConds] }],
    }
  } else {
    throw new Error('invalid trigger state')
  }

  const hysteresisOffAt = trigger.triggerType === 'temperature' && trigger.temperature
    ? trigger.temperature.base - trigger.temperature.hysteresis
    : undefined

  return {
    name: ruleName,
    groupId: groupId ?? undefined,
    conditions,
    actions: {
      targetDeviceId: trigger.deviceIds[0],
      targetDeviceIds: trigger.deviceIds,
      sensorDeviceIds: [],
    } as any,
    priority: 1,
    ...(hysteresisOffAt != null
      ? { description: JSON.stringify({ hysteresisOffAt, originalV2State: { temperature: trigger.temperature } }) }
      : {}),
  }
}

export function transformV2ToLegacy(state: WizardStateV2): CreateRuleRequest {
  switch (state.intent) {
    case 'irrigation': return buildIrrigation(state)
    case 'opener':
    case 'fan':        return buildOpenerFan(state)
    default:           throw new Error(`Cannot transform intent: ${state.intent}`)
  }
}
