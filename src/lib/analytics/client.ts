export async function trackClientEvent(name: string) {
  try {
    await fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      keepalive: true,
    })
  } catch {
    // Fire-and-forget — analytics must never break the user flow.
  }
}