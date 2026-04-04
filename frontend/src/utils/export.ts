/**
 * 측정 기록 내보내기 유틸리티
 */

interface ExportRow {
  [key: string]: string | number | null
}

// CSV 내보내기
export function exportToCsv(data: ExportRow[], filename: string) {
  if (data.length === 0) return

  const headers = Object.keys(data[0])
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h]
        if (val === null || val === undefined) return ''
        const str = String(val)
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str
      }).join(',')
    )
  ]

  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${filename}.csv`)
}

// Excel 내보내기 (xlsx 라이브러리 동적 로드)
export async function exportToExcel(data: ExportRow[], filename: string) {
  try {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '측정 기록')

    // 컬럼 너비 자동 조정
    const colWidths = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length, ...data.map(r => String(r[key] || '').length)) + 2
    }))
    ws['!cols'] = colWidths

    XLSX.writeFile(wb, `${filename}.xlsx`)
  } catch {
    // xlsx 라이브러리 미설치 시 CSV 폴백
    exportToCsv(data, filename)
  }
}

// Blob 다운로드 헬퍼
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 측정 기록을 내보내기 형식으로 변환
export function formatSensorDataForExport(rawData: any[], sensorTypeLabel: (t: string) => string): ExportRow[] {
  return rawData.map(item => ({
    '시간': item.time || item.timestamp || '',
    '측정 항목': sensorTypeLabel(item.sensorType || item.type || ''),
    '값': item.value ?? '',
    '단위': item.unit || '',
    '장치명': item.deviceName || '',
    '구역': item.groupName || '',
  }))
}
