type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function safeZone(timeZone: string): string {
  return timeZone.trim() || 'Asia/Kolkata'
}

function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

function offsetMinutes(ms: number, timeZone: string): number {
  const parts = zonedParts(ms, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return (asUtc - ms) / 60_000
}

export function formatZonedDateTimeInput(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const parts = zonedParts(ms, timeZone)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export function parseZonedDateTimeInput(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  let utc = wall
  for (let i = 0; i < 3; i += 1) {
    utc = wall - offsetMinutes(utc, timeZone) * 60_000
  }
  return new Date(utc).toISOString()
}

export function defaultGoalWindow(timeZone: string, now = new Date()): { start: string; end: string } {
  const parts = zonedParts(now.getTime(), timeZone)
  const date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
  return { start: `${date}T00:00`, end: `${date}T23:59` }
}
