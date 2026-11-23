import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Terjadi kesalahan pada aplikasi.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">Terjadi Gangguan Sistem</h1>
              <p className="text-sm text-slate-600 mt-1">
                Koneksi atau sesi Firebase mengalami gangguan. Silakan muat ulang halaman.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
