import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE_URL = (process.env.BROWSER_ACCEPTANCE_URL || process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '')
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CDP_PORT = Number(process.env.CDP_PORT || 9222)
const NAVIGATION_WAIT_MS = 900

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getWebSocketUrl() {
  if (process.env.CDP_URL) return process.env.CDP_URL
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint did not become ready')
}

class CdpClient {
  constructor(socket) {
    this.socket = socket
    this.id = 0
    this.pending = new Map()
    this.events = []
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const entry = this.pending.get(message.id)
        if (!entry) return
        this.pending.delete(message.id)
        clearTimeout(entry.timer)
        if (message.error) entry.reject(new Error(message.error.message || 'CDP command failed'))
        else entry.resolve(message.result)
        return
      }
      this.events.push(message)
    })
    socket.addEventListener('error', (event) => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(new Error(String(event.message || 'CDP socket error')))
      }
      this.pending.clear()
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`CDP ${method} timed out`))
      }, 15000)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  waitFor(method, timeoutMs = 10000) {
    const existing = this.events.find((event) => event.method === method)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.removeEventListener('message', handler)
        reject(new Error(`Timed out waiting for ${method}`))
      }, timeoutMs)
      const handler = (event) => {
        const message = JSON.parse(String(event.data))
        if (message.method !== method) return
        clearTimeout(timer)
        this.socket.removeEventListener('message', handler)
        resolve(message)
      }
      this.socket.addEventListener('message', handler)
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'Runtime.evaluate failed')
    }
    return result.result.value
  }
}

function consoleErrors(events) {
  return events
    .filter((event) => event.method === 'Runtime.exceptionThrown')
    .map((event) => `exception: ${event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text}`)
    .concat(
      events
        .filter((event) => event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
        .map((event) => `console: ${event.params.args.map((arg) => arg.value || arg.description || '').join(' ')}`),
    )
    .concat(
      events
        .filter((event) => event.method === 'Log.entryAdded' && event.params.entry.level === 'error')
        .map((event) => `log: ${event.params.entry.text}`),
    )
    .concat(
      events
        .filter((event) => event.method === 'Network.loadingFailed' && !/ERR_ABORTED/i.test(event.params.errorText || ''))
        .map((event) => `network: ${event.params.errorText}`),
    )
}

async function checkRoute(cdp, route, expectation = () => true) {
  console.error(`[browser] checking ${route}`)
  cdp.events.length = 0
  const load = cdp.waitFor('Page.loadEventFired', 15000)
  await cdp.send('Page.navigate', { url: `${BASE_URL}${route}` })
  await load
  await sleep(NAVIGATION_WAIT_MS)
  const snapshot = await cdp.evaluate(`({
    title: document.title,
    body: document.body ? document.body.innerText.slice(0, 500) : '',
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    hasLog: Boolean(document.querySelector('[role="log"], textarea, input')),
    path: location.pathname,
  })`)
  const errors = consoleErrors(cdp.events)
  const expected = expectation(snapshot)
  const ok = snapshot.overflow <= 2 && errors.length === 0 && expected
  console.error(`[browser] finished ${route}: ${ok ? 'ok' : 'failed'}`)
  return { route, ok, title: snapshot.title, overflow: snapshot.overflow, errors, expectation: expected }
}

async function main() {
  let chrome
  let userDataDir
  let socket
  try {
    const WebSocketImpl = globalThis.WebSocket || (await import('ws')).default
    if (!process.env.CDP_URL) {
      userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartgain-cdp-'))
      chrome = spawn(CHROME_PATH, [
        `--remote-debugging-port=${CDP_PORT}`,
        '--remote-allow-origins=*',
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${userDataDir}`,
        'about:blank',
      ], { stdio: 'ignore' })
    }
    const wsUrl = await getWebSocketUrl()
    socket = new WebSocketImpl(wsUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    const cdp = new CdpClient(socket)
    await Promise.all([
      cdp.send('Page.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Log.enable'),
      cdp.send('Network.enable'),
    ])

    const embedQuery = new URLSearchParams({
      shop: process.env.BROWSER_ACCEPTANCE_SHOP || 'test5cg.myshopify.com',
      product: 'gid://shopify/Product/1',
      variant: 'gid://shopify/ProductVariant/1',
      price: '999',
      currency: 'INR',
      title: 'Trail Runner',
      view: 'drawer',
      open: '1',
      parentOrigin: BASE_URL,
    }).toString()

    const results = []
    results.push(await checkRoute(cdp, '/', (snapshot) => snapshot.body.length > 0))
    results.push(await checkRoute(cdp, `/bargain/embed?${embedQuery}`, (snapshot) => snapshot.hasLog))
    for (const page of ['/privacy', '/dpa', '/terms']) {
      results.push(await checkRoute(cdp, page, (snapshot) => snapshot.body.length > 0))
    }
    console.log(JSON.stringify({ baseUrl: BASE_URL, results }, null, 2))
    if (results.some((result) => !result.ok)) process.exitCode = 1
  } finally {
    if (socket) socket.close()
    if (chrome) chrome.kill()
    await sleep(750)
    if (userDataDir) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true })
          break
        } catch {
          await sleep(400)
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
