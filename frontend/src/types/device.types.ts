export type EquipmentType = 'opener' | 'fan' | 'irrigation' | 'other'

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
  sensorData?: SensorData | null
  lastSeen?: string
  createdAt: string
  updatedAt: string
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
