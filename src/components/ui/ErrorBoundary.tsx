"use client";

import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MapErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full bg-slate-950 flex items-center justify-center">
          <div className="text-center max-w-xs p-6 rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-sm shadow-2xl">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <p className="text-slate-200 text-sm font-semibold mb-1">แสดงแผนที่ไม่ได้</p>
            <p className="text-slate-500 text-[11px] leading-relaxed mb-4">
              {process.env.NODE_ENV === "development"
                ? this.state.error?.message
                : "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองรีเฟรชหน้านี้"}
            </p>
            <button
              onClick={this.handleRetry}
              className="text-[11px] px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700 transition-colors font-medium"
            >
              ลองใหม่
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
