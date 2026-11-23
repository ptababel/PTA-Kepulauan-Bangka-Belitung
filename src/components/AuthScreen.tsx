import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Database, ShieldCheck, UserCheck, Utensils } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../services/mbbFirestore';
import { LogoBadge } from './LogoBadge';

interface AuthScreenProps {
  externalError?: string;
  onClearExternalError?: () => void;
}

export function AuthScreen({ externalError = '', onClearExternalError }: AuthScreenProps) {
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const displayError = externalError || localError;

  async function handleGoogleSignIn() {
    setLocalError('');
    onClearExternalError?.();
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user') {
        setLocalError('Jendela login Google ditutup sebelum proses masuk selesai.');
      } else if (code === 'auth/popup-blocked') {
        setLocalError('Popup login Google diblokir oleh browser. Izinkan popup lalu coba kembali.');
      } else {
        setLocalError(
          err instanceof Error ? err.message : 'Gagal masuk menggunakan akun Google.'
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Institutional Identity Panel */}
        <div className="lg:col-span-5 bg-emerald-900 text-white p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-white/95 p-2 rounded-lg shrink-0">
                <LogoBadge size="md" />
              </div>
              <div>
                <p className="text-xs font-medium text-emerald-200 tracking-wide">
                  Pengadilan Tinggi Agama
                </p>
                <p className="text-sm font-semibold text-white">
                  Kepulauan Bangka Belitung
                </p>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance mb-3">
              Absen MBB — Makan Berkah Bersama
            </h1>
            <p className="text-sm text-emerald-100/90 leading-relaxed">
              Sistem pencatatan distribusi dan absensi penerimaan Makan Berkah Bersama berbasis
              peran Admin dan Petugas Pembagian Makanan dengan penyimpanan cloud Firebase Firestore.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-emerald-800/80 space-y-2.5 text-xs text-emerald-100">
            <div className="flex items-start gap-2.5">
              <Utensils className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <span>Pencatatan cepat satu ketuk &amp; pencegahan penerimaan ganda harian</span>
            </div>
            <div className="flex items-start gap-2.5">
              <UserCheck className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <span>Hak akses terpisah antara Admin pengelola &amp; Petugas lapangan</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Database className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <span>Tersimpan permanen &amp; tersinkron real-time di Firebase Firestore</span>
            </div>
          </div>
        </div>

        {/* Right Sign-in Panel */}
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Masuk ke Aplikasi</h2>
            <p className="text-sm text-slate-600 mt-1">
              Masuk menggunakan akun Google yang telah diotorisasi sebagai Admin atau Petugas
              Pembagian Makanan.
            </p>
          </div>

          {displayError && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 leading-relaxed"
            >
              {displayError}
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleGoogleSignIn()}
            className="w-full min-h-[48px] px-4 py-3 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#ffffff"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
              />
            </svg>
            {submitting ? 'Memproses Login Google...' : 'Masuk dengan Akun Google'}
          </button>

          <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-800 shrink-0" />
              <span>Ketentuan Akses Berbasis Peran</span>
            </div>
            <p className="leading-relaxed">
              • <strong>Administrator Utama:</strong> Masuk dengan akun Google{' '}
              <span className="font-mono text-slate-800">{BOOTSTRAPPED_ADMIN_EMAIL}</span> untuk
              mengelola daftar pegawai, mengganti nama/unit kerja, impor Excel, koreksi riwayat, dan
              menambahkan email Google Petugas.
            </p>
            <p className="leading-relaxed">
              • <strong>Petugas Pembagian Makanan:</strong> Masuk menggunakan akun Google yang telah
              didaftarkan Admin melalui menu <em>Kelola Pegawai → Akun Petugas &amp; Admin</em>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
