import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch, setAuthToken } from './api/client';
import { AppShell } from './components/AppShell';
import { AuthScreen } from './components/AuthScreen';
import { DashboardView } from './components/DashboardView';
import { KelolaPegawaiView } from './components/KelolaPegawaiView';
import { PenerimaanView } from './components/PenerimaanView';
import { RekapitulasiView } from './components/RekapitulasiView';
import { RiwayatView } from './components/RiwayatView';
import type { AuthUser, NavTab } from './types';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error';
}

export default function App() {
  const [bootLoading, setBootLoading] = useState(true);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 4000);
  }, []);

  useEffect(() => {
    let active = true;
    async function checkAuthStatus() {
      try {
        const status = await apiFetch<{
          ok: true;
          needsInitialSetup: boolean;
        }>('/api/auth/status');
        if (active) {
          setNeedsInitialSetup(status.needsInitialSetup);
        }
      } catch {
        // default to login form
      } finally {
        if (active) setBootLoading(false);
      }
    }
    void checkAuthStatus();
    return () => {
      active = false;
    };
  }, []);

  function handleAuthenticated(loggedInUser: AuthUser) {
    setUser(loggedInUser);
    setActiveTab(loggedInUser.role === 'petugas' ? 'penerimaan' : 'dashboard');
  }

  function handleLogout() {
    setAuthToken(null);
    setUser(null);
    setActiveTab('dashboard');
  }

  function handleSelectTab(tab: NavTab) {
    if (tab === 'pegawai' && user?.role !== 'admin') {
      notify('Menu Kelola Pegawai hanya dapat diakses oleh Admin.', 'error');
      return;
    }
    setActiveTab(tab);
  }

  if (bootLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600 font-medium">Memuat sistem Absen MBB...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        needsInitialSetup={needsInitialSetup}
        onSetupCompleted={() => setNeedsInitialSetup(false)}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <>
      <AppShell
        user={user}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onLogout={handleLogout}
      >
        {activeTab === 'dashboard' && <DashboardView onNavigate={handleSelectTab} />}
        {activeTab === 'penerimaan' && <PenerimaanView user={user} onNotify={notify} />}
        {activeTab === 'pegawai' && user.role === 'admin' && (
          <KelolaPegawaiView currentUser={user} onNotify={notify} />
        )}
        {activeTab === 'riwayat' && <RiwayatView user={user} onNotify={notify} />}
        {activeTab === 'rekapitulasi' && <RekapitulasiView onNotify={notify} />}
      </AppShell>

      {/* Non-intrusive Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 sm:max-w-sm px-4 py-3 rounded-xl border shadow-sm flex items-start justify-between gap-3 text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-900 border-emerald-800 text-white'
              : 'bg-red-800 border-red-700 text-white'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-200" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Tutup notifikasi"
            className="text-white/80 hover:text-white text-xs font-semibold shrink-0 px-1"
          >
            Tutup
          </button>
        </div>
      )}
    </>
  );
}
