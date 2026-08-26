import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

const initialState: ErrorBoundaryState = { hasError: false, message: '' }

/**
 * Root-level safety net. Keeps a render-time crash from blanking the entire
 * app and gives the user a one-click way to recover (reload / go home)
 * instead of staring at a white screen.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state = initialState

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error)
    return { hasError: true, message }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Keep the stack trace in the console so bugs stay diagnosable.
    console.error('[MockMate] Uncaught render error:', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoHome = () => {
    window.location.assign('/')
  }

  render() {
    const { hasError, message } = this.state
    if (!hasError) return this.props.children

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            width: 'min(100%, 480px)',
            background: '#ffffff',
            borderRadius: '24px',
            padding: '36px 32px',
            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.35)',
            textAlign: 'center',
            color: '#1f2937',
          }}
        >
          <div style={{ fontSize: '48px', lineHeight: 1 }}>⚠️</div>
          <h1
            style={{
              margin: '16px 0 8px',
              fontSize: '22px',
              fontWeight: 700,
              color: '#111827',
            }}
          >
            Something went wrong
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#4b5563' }}>
            MockMate hit an unexpected error while rendering this screen. Your
            saved work is safe — reloading usually fixes it.
          </p>
          {message ? (
            <pre
              style={{
                margin: '18px 0 0',
                maxHeight: '110px',
                overflow: 'auto',
                textAlign: 'left',
                fontSize: '12px',
                lineHeight: 1.5,
                background: '#f3f4f6',
                color: '#374151',
                borderRadius: '10px',
                padding: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {message}
            </pre>
          ) : null}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginTop: '24px',
            }}
          >
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                border: 'none',
                cursor: 'pointer',
                borderRadius: '999px',
                padding: '11px 26px',
                fontWeight: 600,
                fontSize: '14px',
                color: '#ffffff',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              style={{
                cursor: 'pointer',
                borderRadius: '999px',
                padding: '11px 26px',
                fontWeight: 600,
                fontSize: '14px',
                color: '#4b5563',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
              }}
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
