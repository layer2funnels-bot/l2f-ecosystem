import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from './ui/Button.tsx';
import { EmptyState } from './ui/Feedback.tsx';

interface State { error: Error | null }

/** Global safety net: a rendering bug shows a friendly reload screen, never a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Unhandled UI error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="pm-fullpage">
        <EmptyState
          icon="alert"
          title="Something went wrong"
          text="The app hit an unexpected problem. Reloading usually fixes it, and your work on the server is safe."
          action={<div className="pm-row"><Button variant="primary" onClick={() => window.location.reload()}>Reload</Button><Button onClick={() => { window.location.hash = '#/projects'; this.setState({ error: null }); }}>Back to Home</Button></div>}
        />
      </div>
    );
  }
}
