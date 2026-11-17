'use client'

import { useCallback, useEffect, useRef, useState, type RefObject, type UIEvent } from 'react'

export function createConversationId(prefix = 'cg'): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `${prefix}-${uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`
}

export type ConversationAutoScrollOptions = {
  scrollRef: RefObject<HTMLElement | null>
  messageCount: number
  activityKey?: unknown
  threshold?: number
  suppressMs?: number
}

export function useConversationAutoScroll({
  scrollRef,
  messageCount,
  activityKey,
  threshold = 80,
  suppressMs = 2500,
}: ConversationAutoScrollOptions) {
  const [atBottom, setAtBottom] = useState(true)
  const [unread, setUnread] = useState(0)
  const atBottomRef = useRef(true)
  const lastInteractRef = useRef(0)
  const forcedRef = useRef(false)
  const lastCountRef = useRef(messageCount)

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    atBottomRef.current = true
    setAtBottom(true)
    setUnread(0)
  }, [scrollRef])

  const jumpToLatest = useCallback(() => {
    forcedRef.current = true
    const frame = requestAnimationFrame(scrollToLatest)
    return () => cancelAnimationFrame(frame)
  }, [scrollToLatest])

  const noteSent = useCallback(() => {
    forcedRef.current = true
    lastInteractRef.current = 0
    const frame = requestAnimationFrame(scrollToLatest)
    return () => cancelAnimationFrame(frame)
  }, [scrollToLatest])

  const handleScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const el = event.currentTarget
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    atBottomRef.current = nearBottom
    setAtBottom(nearBottom)
    if (nearBottom) {
      lastInteractRef.current = 0
      setUnread(0)
      return
    }
    lastInteractRef.current = Date.now()
  }, [threshold])

  useEffect(() => {
    void activityKey
    const added = Math.max(0, messageCount - lastCountRef.current)
    lastCountRef.current = messageCount
    const forced = forcedRef.current
    if (forced || atBottomRef.current || Date.now() - lastInteractRef.current >= suppressMs) {
      forcedRef.current = false
      const frame = requestAnimationFrame(scrollToLatest)
      return () => cancelAnimationFrame(frame)
    }
    if (added > 0) setUnread((count) => count + added)
  }, [activityKey, messageCount, scrollToLatest, suppressMs])

  return { atBottom, unread, handleScroll, noteSent, jumpToLatest }
}
