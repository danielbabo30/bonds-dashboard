/** Convert agorot (integer) to shekel price string: 9850 → "98.50" */
export function formatPrice(agorot: number): string {
  return (agorot / 100).toFixed(2)
}

/** Format YTM as percentage string: 4.2 → "4.20%" */
export function formatYTM(ytm: number): string {
  return `${ytm.toFixed(2)}%`
}

/** Format duration to 1 decimal: 3.8 → "3.8" */
export function formatDuration(d: number): string {
  return d.toFixed(1)
}

/**
 * Calculate parity (premium / discount) relative to ₪100 par.
 * Returns label like "פרמיה +2.10" or "ניכיון -1.50".
 */
export function calcParity(agorot: number): { diff: number; label: string; isAbove: boolean } {
  const price = agorot / 100
  const diff = price - 100
  const isAbove = diff >= 0
  const sign = isAbove ? '+' : ''
  const label = isAbove
    ? `פרמיה ${sign}${diff.toFixed(2)}`
    : `ניכיון ${diff.toFixed(2)}`
  return { diff, label, isAbove }
}

/** Returns the last TASE business date formatted as DD/MM/YYYY.
 *  TASE trades Sun–Thu; Fri–Sat are weekend.
 */
export function getLastBusinessDate(): string {
  const ref = new Date('2026-05-17') // Today in simulation
  const day = ref.getDay() // 0=Sun … 6=Sat
  if (day === 5) ref.setDate(ref.getDate() - 1)  // Friday → Thursday
  if (day === 6) ref.setDate(ref.getDate() - 2)  // Saturday → Thursday
  const d = String(ref.getDate()).padStart(2, '0')
  const m = String(ref.getMonth() + 1).padStart(2, '0')
  const y = ref.getFullYear()
  return `${d}/${m}/${y}`
}

/** Format YYYY-MM-DD to DD/MM for chart tick labels */
export function formatChartDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-')
  return `${day}/${month}`
}
