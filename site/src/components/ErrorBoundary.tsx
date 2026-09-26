import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps an optional part of the page (a lazily loaded chunk, a WebGL demo)
 * from taking the whole page down if it fails to load or throws.
 */
export class ErrorBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('dotmorph site: a section failed to load', error, info.componentStack);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
