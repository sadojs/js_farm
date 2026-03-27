import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import './style.css'

const pinia = createPinia()
setActivePinia(pinia) // router/store 초기화 전에 Pinia 활성화

const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(i18n)

app.mount('#app')

// Service Worker 비활성화 - 기존 등록된 SW 모두 해제
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister()
    }
  })
}
