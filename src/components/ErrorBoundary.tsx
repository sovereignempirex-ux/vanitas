import React from 'react';

interface BoundaryState {
  error: Error | null;
}

interface BoundaryProps {
  children: React.ReactNode;
}

/**
 * Last-resort render guard. Any uncaught component error (a bad response
 * shape, a failed optional chain in deep UI) shows a readable recovery
 * screen with a reload action instead of silently white-screening the SPA.
 *
 * (Project types are loose — React ships without @types here — so `props`
 * is declared explicitly instead of inherited from React.Component.)
 */
export class ErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  declare props: BoundaryProps;
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Detail stays in the developer console — the on-screen message keeps
    // only what a user needs to recover.
    console.error('[ui] render crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen vnt-app-bg flex flex-col items-center justify-center gap-4 p-6 text-slate-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/10 text-xl font-black text-amber-300">
            !
          </div>
          <h1 className="text-lg font-bold text-white">Something went wrong</h1>
          <p className="max-w-md text-center text-xs leading-relaxed text-slate-400">
            The interface hit an unexpected error. Your account and data are unaffected —
            reloading usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-xs font-bold text-white transition-colors"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
