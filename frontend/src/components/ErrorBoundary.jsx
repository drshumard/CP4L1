import React from 'react';
import { ArrowLeft, CircleAlert, RefreshCw } from 'lucide-react';

// A render crash anywhere used to unmount React to a silent white page (e.g. formatting a date with an invalid
// stored timezone). Catch it and give a way back. `resetKey` (the route) clears the error when you navigate, so one
// bad render doesn't stick to every page. `inline` = inside the admin shell (the sidebar stays usable).

const FONT = '"Inter Checkout", Inter, "Helvetica Neue", Arial, sans-serif';
const BUTTON = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, padding: '11px 16px',
  borderRadius: 3, fontFamily: FONT, fontSize: 14, fontWeight: 500, cursor: 'pointer',
};

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" style={{ minHeight: this.props.inline ? '60vh' : '100vh', display: 'grid', placeItems: 'center', padding: 16, background: this.props.inline ? 'transparent' : '#f8f9fc', fontFamily: FONT, WebkitFontSmoothing: 'antialiased' }}>
        <div style={{ width: '100%', maxWidth: 440, padding: '32px 30px', border: '1px solid #dce3ee', borderRadius: 5, background: '#fff', boxShadow: '0 4px 16px #23364f05', color: '#111' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, border: '1px solid #dce5fa', borderRadius: 4, background: '#edf2ff', color: '#315ed1' }}>
            <CircleAlert size={21} />
          </span>
          <h1 style={{ margin: '20px 0 0', fontFamily: FONT, fontSize: 22, fontWeight: 500, letterSpacing: '-0.03em', color: '#111' }}>Something went wrong</h1>
          <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.6, color: '#444' }}>
            An unexpected error stopped this page. Your information is safe — reloading usually fixes it.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
            <button type="button" onClick={() => window.location.reload()}
              style={{ ...BUTTON, border: '1px solid #efb542', background: '#ffc24a', color: '#382f1b' }}>
              <RefreshCw size={16} />Reload the page
            </button>
            <button type="button" onClick={() => window.history.back()}
              style={{ ...BUTTON, border: '1px solid #dfe5ee', background: '#fff', color: '#111' }}>
              <ArrowLeft size={16} />Go back
            </button>
          </div>
          <details style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid #e7ecf3', fontSize: 12.5, color: '#444' }}>
            <summary style={{ cursor: 'pointer' }}>Technical details</summary>
            <pre style={{ margin: '10px 0 0', padding: '10px 12px', border: '1px solid #e3e8f0', borderRadius: 3, background: '#f8f9fc', color: '#111', fontFamily: FONT, fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {String(error?.message || error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
