import { Component } from 'react'

/**
 * Catches render-time errors anywhere in the route tree and shows a
 * recoverable fallback instead of a blank white screen. This is a real
 * production safety net — D3 simulations, third-party SDK quirks, or a
 * malformed API payload can all throw mid-render.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // In production this is where you'd forward to an error-tracking
    // service (Sentry, etc). Kept local-only here.
    console.error('LectureMap render error:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="text-5xl mb-4">🗺️💥</div>
            <h2 className="text-xl font-semibold text-primary mb-2">
              Something went off the map
            </h2>
            <p className="text-sm text-secondary mb-6">
              An unexpected error interrupted this view. Your data is safe —
              try reloading this section.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="bg-brand-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => { window.location.href = '/dashboard' }}
                className="text-sm text-secondary hover:text-primary transition-colors"
              >
                Back to dashboard
              </button>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mt-6 text-left text-xs text-red-500 bg-red-50 rounded-lg p-3 overflow-auto max-h-40">
                {String(this.state.error?.stack || this.state.error)}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
