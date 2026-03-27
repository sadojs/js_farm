/**
 * 날짜 포맷 유틸리티
 * 플랫폼 전체에서 일관된 날짜 표시를 위해 사용합니다.
 * 기본 포맷: yyyy-MM-dd (ISO 8601 기반)
 */

/** yyyy-MM-dd 포맷 (예: 2026-03-27) */
export function formatDate(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** yyyy-MM-dd HH:mm 포맷 (예: 2026-03-27 14:30) */
export function formatDateTime(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input)
  const date = formatDate(d)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${date} ${hh}:${mm}`
}

/** 차트용 시간 라벨: 단기(12h/today)는 HH:00, 장기는 MM-dd HH시 */
export function formatChartTimeLabel(dateStr: string, isShortRange: boolean): string {
  const d = new Date(dateStr)
  if (isShortRange) {
    return `${String(d.getHours()).padStart(2, '0')}:00`
  }
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${m}-${day} ${String(d.getHours()).padStart(2, '0')}시`
}

/** 상대 시간 표시 (예: 3분 전, 2시간 전, 1일 전) */
export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}
