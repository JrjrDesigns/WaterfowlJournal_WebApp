import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  crashed: boolean
}

/**
 * Without this, one bad render blanks the whole app — no message, no way back,
 * and nothing in the logs that reaches us. A hunter in a blind reads a white
 * screen as "the app is broken", so give them something to act on instead.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Render failed:', error, info.componentStack)
  }

  render() {
    if (!this.state.crashed) return this.props.children

    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-display text-3xl text-ink tracking-wider leading-none">
            SOMETHING BROKE
          </h1>
          <p className="text-muted text-sm mt-3 leading-relaxed">
            This screen failed to load. Your hunts are safe — nothing was lost.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-ink hover:bg-black text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-6"
          >
            Reload
          </button>
          <button
            onClick={() => { window.location.href = '/hunts' }}
            className="w-full text-muted font-semibold py-3 text-sm mt-1"
          >
            Back to My Hunts
          </button>
        </div>
      </div>
    )
  }
}
