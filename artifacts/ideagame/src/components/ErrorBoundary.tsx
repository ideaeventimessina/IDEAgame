import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary — catches any React render error that would
 * otherwise crash the entire app and shows a recoverable UI.
 * Also logs the error to console so it appears in dev tools.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#06020f',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
          textAlign: 'center',
          gap: '1rem',
        }}>
          <div style={{ fontSize: '2rem' }}>⚠️</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>Qualcosa è andato storto</div>
          <div style={{ fontSize: '0.875rem', color: '#888', maxWidth: 480 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              marginTop: '1rem',
              padding: '0.625rem 1.5rem',
              borderRadius: '0.75rem',
              background: '#F5B642',
              color: '#000',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Ricarica pagina
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
