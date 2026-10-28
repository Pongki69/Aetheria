import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { GoogleOAuthProvider } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Aetheria failed while rendering:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#07090e', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
          <section role="alert" style={{ width: 'min(560px, 100%)', padding: 24, border: '1px solid rgba(248,113,113,.35)', borderRadius: 14, background: '#111827', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
            <h1 style={{ margin: '0 0 10px', fontSize: 20 }}>Aetheria couldn’t open the workspace</h1>
            <p style={{ margin: '0 0 18px', color: '#fca5a5', fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{this.state.error.message || 'An unexpected rendering error occurred.'}</p>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: '9px 14px', border: 0, borderRadius: 8, background: '#0284c7', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Reload app</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {GOOGLE_CLIENT_ID ? (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <App googleAuthEnabled />
        </GoogleOAuthProvider>
      ) : (
        <App googleAuthEnabled={false} />
      )}
    </AppErrorBoundary>
  </React.StrictMode>
);
