'use client'

import React, { Component, ErrorInfo } from 'react'

/**
 * Captures uncaught client errors and unhandled promise rejections and reports
 * them (sanitized + truncated) to /api/client-error so they land in the same
 * ErrorLog surface as server errors. Also acts as a crash boundary so a failing
 * widget degrades to a recoverable panel instead of a white screen.
 *
 * Privacy: we send only message/stack/operation/page — no cookies, no PII, no
 * message contents. Batching caps the number of reports per session.
 */
interface BoundaryState {
  hasError: boolean
}

const MAX_REPORTS_PER_SESSION = 40
const BATCH_MS = 4000
const MAX_BATCH = 10

let reportsSent = 0

function reportErrors(batch: { message: string; stack?: string; operation: string }[]) {
  if (typeof fetch !== 'function' || batch.length === 0) return
  const body = {
    events: batch.slice(0, MAX_BATCH),
    page: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
  }
  void fetch('/api/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {})
}

const recentKey = (m: string, s: string) => `${s}:${m.slice(0, 120)}`

export class ClientErrorBoundary extends Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false }

  private queue: { message: string; stack?: string; operation: string }[] = []
  private recent = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.pushReport(error.message, 'component_crash', error.stack)
  }

  componentDidMount() {
    if (typeof window === 'undefined') return

    const onError = (event: ErrorEvent) => {
      this.pushReport(event.message || 'window error', 'window_error')
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : String(reason)
      this.pushReport(message, 'unhandled_rejection', reason instanceof Error ? reason.stack : undefined)
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    this.timer = setInterval(() => this.flush(), BATCH_MS)
  }

  componentWillUnmount() {
    if (this.timer) clearInterval(this.timer)
    this.flush()
  }

  pushReport(message: string, operation: string, stack?: string) {
    if (reportsSent >= MAX_REPORTS_PER_SESSION) return
    const key = recentKey(message, operation)
    // Collapse repeated identical errors (e.g. a polling endpoint failing every Ns).
    if (this.recent.has(key)) return
    this.recent.add(key)
    if (this.recent.size > 200) this.recent.clear()
    this.queue.push({ message: String(message).slice(0, 2000), stack, operation: String(operation).slice(0, 120) })
    reportsSent += 1
}

  flush() {
    if (this.queue.length === 0) return
    const batch = this.queue.splice(0, this.queue.length)
    reportErrors(batch)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <h1 className="text-lg font-semibold text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-400 mb-6">
              This part of CartGain hit an unexpected error. The rest of your dashboard is unaffected.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}