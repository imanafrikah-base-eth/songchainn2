import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[App] Uncaught render error:', error.message);
    if (import.meta.env.DEV) {
      console.error('[App] Component stack:', info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'hsl(222 47% 6%)',
            color: 'hsl(210 40% 98%)',
            padding: '2rem',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(239,68,68,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                fontSize: '1.75rem',
              }}
            >
              ⚠
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem', margin: '0 0 0.75rem' }}>
              Something went wrong
            </h1>
            <p style={{ color: 'hsl(215 20% 55%)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              The app hit an unexpected error. Reload to continue.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre
                style={{
                  background: 'hsl(222 47% 10%)',
                  border: '1px solid hsl(222 47% 18%)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  fontSize: '0.75rem',
                  textAlign: 'left',
                  color: 'hsl(0 84% 70%)',
                  marginBottom: '1.5rem',
                  maxHeight: '200px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: 'hsl(217 91% 60%)',
                  color: 'hsl(222 47% 6%)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Reload app
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  background: 'transparent',
                  color: 'hsl(215 20% 55%)',
                  border: '1px solid hsl(222 47% 18%)',
                  borderRadius: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
