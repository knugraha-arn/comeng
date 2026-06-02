export function formatWeekKey(weekKey: string): string {
  // Format baru: "2 Jun 2026 – 8 Jun 2026" → "02/06/26 – 08/06/26"
  // Format lama: "2026-W23" → tetap tampilkan as-is sebagai fallback
  if (weekKey.includes('W') && !weekKey.includes('–')) {
    return weekKey
  }

  const parts = weekKey.split('–').map(s => s.trim())
  if (parts.length !== 2) return weekKey

  const fmt = (dateStr: string) => {
    const months: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
      'Mei': '05', 'Jun': '06', 'Jul': '07', 'Agu': '08',
      'Sep': '09', 'Okt': '10', 'Nov': '11', 'Des': '12',
    }
    const [day, month, year] = dateStr.trim().split(' ')
    const mm = months[month] || '00'
    const yy = year?.slice(2) || '00'
    const dd = day.padStart(2, '0')
    return `${dd}/${mm}/${yy}`
  }

  return `${fmt(parts[0])} – ${fmt(parts[1])}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yy} ${hh}:${min}`
}
