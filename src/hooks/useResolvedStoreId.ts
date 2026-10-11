'use client'

import { useEffect, useState } from 'react'

type HookState = {
  storeId: string | null
  loading: boolean
  error: string | null
}

// Resolves the caller's store strictly server-side from the authenticated
// session. The store id is NEVER read from the URL: a storeId query param is
// not an access key, and carrying one around only made it look like one.
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
        const response = await fetch('/api/stores/current')
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Sign in to load your store and dashboard data')
          }
          throw new Error('Could not resolve the current user store')
        }

        const data = await response.json()
        const resolvedId: string | null = data?.store?.id ?? null

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
