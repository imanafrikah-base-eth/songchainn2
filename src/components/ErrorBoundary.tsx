import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  showDetails: boolean;
  copied: boolean;
}

const EMPTY: State = {
  hasError: false,
  error: null,
  componentStack: '',
  showDetails: false,
  copied: false,
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = EMPTY;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[App] Uncaught render error:', error.message);
    console.error('[App] Component stack:', info.componentStack);
    this.setState({ componentStack: info.componentStack || '' });
  }

  handleReset = () => {
    this.setState(EMPTY);
  };

  /**
   * Everything needed to identify the crash, in one block a person can send on.
   *
   * This used to be hidden outside development, which meant a crash inside the
   * Farcaster mini app or any other webview reported itself as "something went
   * wrong" and nothing else. Nobody can fix that, and the person who hit it
   * cannot tell you anything more than that they hit it.
   */
  details(): string {
    const err = this.state.error;
    const lines = [
      err?.message || 'No error message',
      '',
      err?.stack ? String(err.stack).split('\n').slice(0, 12).join('\n') : '(no stack)',
    ];
    if (this.state.componentStack) {
      lines.push('', 'Component stack:', this.state.componentStack.split('\n').slice(0, 12).join('\n'));
    }
    try {
      lines.push('', `Page: ${window.location.pathname}${window.location.search}`);
      lines.push(`Time: ${new Date().toISOString()}`);
      lines.push(`Browser: ${navigator.userAgent}`);
    } catch {
      // Nothing worth losing the whole report over.
    }
    return lines.join('\n');
  }

  handleCopy = () => {
    const text = this.details();
    const done = () => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done, () => this.fallbackCopy(text, done));
        return;
      }
    } catch {
      // Clipboard blocked in this webview. Fall through.
    }
    this.fallbackCopy(text, done);
  };

  fallbackCopy(text: string, done: () => void) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch {
      // Cannot copy here. The text is on screen under Show details, so it can
      // still be read out or screenshotted.
      this.setState({ showDetails: true });
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const ghostButton = {
        background: 'transparent',
        color: 'hsl(215 20% 55%)',
        border: '1px solid hsl(220 6% 21%)',
        borderRadius: '0.5rem',
        padding: '0.625rem 1.25rem',
        cursor: 'pointer',
        fontSize: '0.875rem',
      } as const;

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'hsl(220 8% 7%)',
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

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: 'hsl(217 91% 60%)',
                  color: 'hsl(220 8% 7%)',
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
              <button onClick={this.handleReset} style={ghostButton}>
                Try again
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              <button
                onClick={this.handleCopy}
                style={ghostButton}
                aria-label="Copy the error details so they can be sent on"
              >
                {this.state.copied ? 'Copied' : 'Copy error details'}
              </button>
              <button
                onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
                style={ghostButton}
                aria-expanded={this.state.showDetails}
              >
                {this.state.showDetails ? 'Hide details' : 'Show details'}
              </button>
            </div>

            {this.state.showDetails && (
              <pre
                style={{
                  background: 'hsl(220 7% 11%)',
                  border: '1px solid hsl(220 6% 21%)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  fontSize: '0.7rem',
                  textAlign: 'left',
                  color: 'hsl(0 84% 78%)',
                  marginTop: '1.25rem',
                  marginBottom: 0,
                  maxHeight: '260px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                }}
              >
                {this.details()}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
