'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

export class AuxiliaryErrorBoundary extends Component<{ children: ReactNode; title: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Auxiliary module failed', { name: error.name, componentStack: info.componentStack });
  }
  render() {
    if (this.state.failed) return (
      <section className="auxiliary-failure" role="alert">
        <strong>{this.props.title}暂时不可用</strong>
        <p>正文编辑和本地保存不受影响。</p>
        <button onClick={() => this.setState({ failed: false })} type="button">重试此模块</button>
      </section>
    );
    return this.props.children;
  }
}
