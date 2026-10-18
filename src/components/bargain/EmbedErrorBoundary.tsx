'use client'

import React from 'react'

// The bargain widget runs inside a merchant's Shopify storefront as a public
// iframe. Any render/lifecycle exception there previously escaped as an
// uncaught error on the customer's page. This boundary contains it: the frame
// reports itself as empty so the theme controller hides it, and the crash is
// logged for us without ever bubbling into the host document.
//
// NOTE: React error boundaries only catch errors during rendering, in lifecycle
// methods and in constructors — not in event handlers or async callbacks. Those
// paths are guarded at their call sites in the widget.

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

export default class EmbedErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    try {
      console.error('[bargain-embed] widget crashed:', error, info.componentStack)
    } catch {
      // ignore
    }
    try {
      window.parent?.postMessage({ type: 'cg_empty' }, '*')
      window.parent?.postMessage({ type: 'cg_resize', height: 0 }, '*')
    } catch {
      // ignore
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) return null
    return this.props.children
  }
}
