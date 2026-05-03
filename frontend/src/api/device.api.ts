import apiClient from './client'
import type { ChannelMapping, Device, DeviceDependenciesResponse, RegisterDeviceRequest } from '../types/device.types'

export const deviceApi = {
  getAll: () =>
    apiClient.get<Device[]>('/devices'),

  getById: (id: string) =>
    apiClient.get<Device>(`/devices/${id}`),

  getTuyaDevices: (projectId?: string) =>
    apiClient.get('/tuya/devices', { params: projectId ? { projectId } : undefined }),

  register: (devices: RegisterDeviceRequest['devices'], houseId?: string, tuyaProjectId?: string) =>
    apiClient.post<Device[]>('/devices/register', { devices, ...(houseId && { houseId }), ...(tuyaProjectId && { tuyaProjectId }) }),

  update: (id: string, data: Partial<Device>) =>
    apiClient.put<Device>(`/devices/${id}`, data),

  remove: (id: string) =>
    apiClient.delete(`/devices/${id}`),

  control: (id: string, commands: { code: string; value: any }[]) =>
    apiClient.post(`/devices/${id}/control`, { commands }),

  getStatus: (id: string) =>
    apiClient.get(`/devices/${id}/status`),

  getDependencies: (id: string) =>
    apiClient.get<DeviceDependenciesResponse>(`/devices/${id}/dependencies`),

  removeOpenerPair: (id: string) =>
    apiClient.delete<{ message: string; deletedIds: string[] }>(`/devices/${id}/opener-pair`),

  rename: (id: string, name: string) =>
    apiClient.patch<{ id: string; name: string }>(`/devices/${id}/name`, { name }),

  updateChannelMapping: (id: string, mapping: ChannelMapping) =>
    apiClient.patch<Device>(`/devices/${id}/channel-mapping`, { mapping }),
}
