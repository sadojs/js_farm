import apiClient from './client'

export interface ReportParams {
  groupId?: string
  houseId?: string
  sensorType?: string
  startDate: string
  endDate: string
}

export const reportApi = {
  getStatistics: (params: ReportParams) =>
    apiClient.get('/reports/statistics', { params }),

  getHourlyData: (params: ReportParams) =>
    apiClient.get('/reports/hourly', { params }),

  getActuatorStats: (params: Omit<ReportParams, 'houseId' | 'sensorType'>) =>
    apiClient.get('/reports/actuator-stats', { params }),

  exportCsv: (params: ReportParams) =>
    apiClient.get('/reports/export/csv', {
      params,
      responseType: 'blob',
    }),

  exportPdf: (params: ReportParams) =>
    apiClient.get('/reports/export/pdf', {
      params,
      responseType: 'blob',
    }),
}
