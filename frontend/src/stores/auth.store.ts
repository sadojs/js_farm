import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '../api/auth.api'
import type { User } from '../types/auth.types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(null)
  const refreshTokenValue = ref<string | null>(null)
  const loading = ref(false)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  // accessToken 만료 전 자동 갱신 (만료 20분 전에 갱신)
  function scheduleTokenRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer)
    // accessToken 24시간 기준 → 23시간 40분 후 갱신 (= 23*60+40 = 1420분)
    const REFRESH_INTERVAL = 23 * 60 * 60 * 1000 + 40 * 60 * 1000
    refreshTimer = setTimeout(async () => {
      const ok = await refreshToken()
      if (ok) scheduleTokenRefresh()
    }, REFRESH_INTERVAL)
  }

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  const isAuthenticated = computed(() => !!accessToken.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isFarmAdmin = computed(() => user.value?.role === 'farm_admin')
  const isFarmUser = computed(() => user.value?.role === 'farm_user')

  async function login(email: string, password: string) {
    loading.value = true
    try {
      const { data } = await authApi.login(email, password)
      accessToken.value = data.accessToken
      refreshTokenValue.value = data.refreshToken
      user.value = data.user
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      scheduleTokenRefresh()
    } finally {
      loading.value = false
    }
  }

  function logout() {
    clearRefreshTimer()
    user.value = null
    accessToken.value = null
    refreshTokenValue.value = null
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
  }

  async function refreshToken(): Promise<boolean> {
    const token = refreshTokenValue.value || localStorage.getItem('refreshToken')
    if (!token) return false
    try {
      const { data } = await authApi.refresh(token)
      accessToken.value = data.accessToken
      refreshTokenValue.value = data.refreshToken
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      return true
    } catch {
      logout()
      return false
    }
  }

  async function fetchUser() {
    try {
      const { data } = await authApi.me()
      user.value = data
    } catch {
      // token invalid
    }
  }

  async function initAuth() {
    const storedToken = localStorage.getItem('accessToken')
    const storedRefresh = localStorage.getItem('refreshToken')
    if (storedToken) {
      accessToken.value = storedToken
      refreshTokenValue.value = storedRefresh
      await fetchUser()
      if (isAuthenticated.value) scheduleTokenRefresh()
    } else if (storedRefresh) {
      refreshTokenValue.value = storedRefresh
      await refreshToken()
      if (accessToken.value) {
        await fetchUser()
        scheduleTokenRefresh()
      }
    }
  }

  return {
    user,
    accessToken,
    loading,
    isAuthenticated,
    isAdmin,
    isFarmAdmin,
    isFarmUser,
    login,
    logout,
    refreshToken,
    fetchUser,
    initAuth,
  }
})
