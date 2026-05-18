'use client'

import { useEffect, useState } from 'react'

type HookState = {
  storeId: string | null
  loading: boolean
  error: string | null
}

export function useResolvedStoreId(): HookState {
  const [state, setState] = useState<HookState>({
    storeId: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    const resolveStoreId = async () => {
      try {
        const fromQuery = new URLSearchParams(window.location.search).get('storeId')
        if (fromQuery) {
          if (!cancelled) {
            setState({ storeId: fromQuery, loading: false, error: null })
          }
          return
        }

        const response = await fetch('/api/stores/current')
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Sign in to load your store and dashboard data')
          }
          throw new Error('Could not resolve the current user store')
        }

        const data = await response.json()
        const resolvedId: string | undefined = data?.store?.id

        if (!resolvedId) {
          throw new Error('Store ID is missing from server response')
        }

        if (!cancelled) {
          setState({ storeId: resolvedId, loading: false, error: null })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            storeId: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to resolve store ID',
          })
        }
      }
    }

    resolveStoreId()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
