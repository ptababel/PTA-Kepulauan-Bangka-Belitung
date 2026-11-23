import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { CheckCircle2, XCircle } from 'lucide-react';
import { auth } from './firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  getFriendlyErrorMessage,
  resolveSignedInUser,
} from './services/mbbFirestore';
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 4500);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setBootLoading(false);
        return;
      }

      setBootLoading(true);
      setAuthError('');
      try {
        const res = await resolveSignedInUser(fbUser);
        if (res.status === 'ok') {
          setUser(res.user);
          setActiveTab(res.user.role === 'petugas' ? 'penerimaan' : 'dashboard');
        } else {
          await signOut(auth);
          setUser(null);
          if (res.status === 'unverified') {
            setAuthError('Email akun Google belum terverifikasi. Gunakan akun Google terverifikasi.');
          } else if (res.status === 'inactive') {
            setAuthError('Akun Anda sedang dinonaktifkan. Silakan hubungi Administrator.');
          } else {
            setAuthError(
              `Akun Google ${res.email} belum terdaftar sebagai Admin atau Petugas. Hubungi Administrator (${BOOTSTRAPPED_ADMIN_EMAIL}) untuk mendaftarkan email Anda pada menu Kelola Pegawai → Akun Petugas & Admin.`
            );
          }
        }
      } catch (err) {
        await signOut(auth).catch(() => undefined);
        setUser(null);
        setAuthError(
          getFriendlyErrorMessage(
            err,
            'Gagal memverifikasi akses akun di Firebase Firestore. Silakan coba lagi.'
          )
        );
      } finally {
        setBootLoading(false);
      }
    });

    return () => unsub();
  }, []);

  async function handleLogout() {
    try {
      await signOut(auth);
      setUser(null);
      setAuthError('');
      setActiveTab('dashboard');
    } catch {
      notify('Gagal keluar dari sesi Google.', 'error');
    }
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
        <div className="text-sm text-slate-600 font-medium">
          Menghubungkan sistem Absen MBB ke Firebase...
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen externalError={authError} onClearExternalError={() => setAuthError('')} />;
  }

  return (
    <>
      <AppShell
        user={user}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onLogout={() => void handleLogout()}
      >
        {activeTab === 'dashboard' && <DashboardView onNavigate={handleSelectTab} />}
        {activeTab === 'penerimaan' && <PenerimaanView user={user} onNotify={notify} />}
        {activeTab === 'pegawai' && user.role === 'admin' && (
          <KelolaPegawaiView currentUser={user} onNotify={notify} />
        )}
        {activeTab === 'riwayat' && <RiwayatView user={user} onNotify={notify} />}
        {activeTab === 'rekapitulasi' && <RekapitulasiView user={user} onNotify={notify} />}
      </AppShell>

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
