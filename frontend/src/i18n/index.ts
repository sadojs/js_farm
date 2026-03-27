import { createI18n } from 'vue-i18n'
import ko from './locales/ko'
import en from './locales/en'

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('sf-locale') || 'ko',
  fallbackLocale: 'ko',
  messages: { ko, en },
})
