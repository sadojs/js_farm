export type EquipmentType = 'fan' | 'irrigation' | 'opener_open' | 'opener_close' | 'other'

export interface SensorData {
  [key: string]: number | null | undefined
}

export interface Device {
  id: string
  userId: string
  houseId?: string
  tuyaDeviceId: string
  name: string
  category: string
  deviceType: 'sensor' | 'actuator'
  equipmentType?: EquipmentType
  icon?: string
  online: boolean
  switchState?: boolean | null
  switchStates?: Record<string, boolean>
  sensorData?: SensorData | null
  lastSeen?: string
  createdAt: string
  updatedAt: string
  pairedDeviceId?: string
  openerGroupName?: string
}

export interface RegisterDeviceRequest {
  devices: {
    tuyaDeviceId: string
    name: string
    category: string
    deviceType: 'sensor' | 'actuator'
    equipmentType?: EquipmentType
    online?: boolean
  }[]
  houseId?: string
}

export interface DeviceControlRequest {
  commands: {
    code: string
    value: any
  }[]
}

export interface TuyaDeviceInfo {
  id: string
  name: string
  category: string
  online: boolean
  productName: string
}
