import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(date)
}

export function calculateRecoveryRate(recovered: number, abandoned: number): number {
  if (abandoned === 0) return 0
  return Math.round((recovered / abandoned) * 100)
}

export function calculateROI(revenue: number, cost: number): number {
  if (cost === 0) return 0
  return Math.round(((revenue - cost) / cost) * 100)
}

export function generateDiscountCode(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'RECOVER-'
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function sanitizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/
  return phoneRegex.test(phone.replace(/\D/g, ''))
}

export function getTimezoneOffset(timezone: string): number {
  const now = new Date()
  const tzString = now.toLocaleString('en-US', { timeZone: timezone })
  const localString = now.toLocaleString('en-US')
  const diff = (Date.parse(localString) - Date.parse(tzString)) / 3600000
  return diff
}

export function isInBusinessHours(timezone: string): boolean {
  const now = new Date()
  const hour = now.getHours()
  return hour >= 9 && hour <= 20
}
