import apiClient from './client'

export interface DashboardWeatherResponse {
  location: {
    address: string
    level1: string
    level2: string
    level3: string
    nx: number
    ny: number
    longitude: number
    latitude: number
  }
  weather: {
    temperature: number | null
    humidity: number | null
    precipitation: number | null
    windSpeed: number | null
    condition: string
  }
  fetchedAt: string
  source: {
    baseDate: string
    baseTime: string
    endpoint: string
  }
}

export const dashboardApi = {
  getWeather: () => apiClient.get<DashboardWeatherResponse>('/dashboard/weather'),
}
