import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, UserCheck, Utensils } from 'lucide-react';
import { apiFetch, ApiError, setAuthToken } from '../api/client';
import type { AuthUser } from '../types';
import { LogoBadge } from './LogoBadge';

interface AuthScreenProps {
  needsInitialSetup: boolean;
  onAuthenticated: (user: AuthUser) => void;
  onSetupCompleted: () => void;
}

export function AuthScreen({
  needsInitialSetup,
  onAuthenticated,
  onSetupCompleted,
}: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // First-run Admin setup fields
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminName, setAdminName] = useState('Administrator MBB');
  const [adminPassword, setAdminPassword] = useState('');
  const [createInitialPetugas, setCreateInitialPetugas] = useState(true);
  const [petugasUsername, setPetugasUsername] = useState('petugas1');
  const [petugasName, setPetugasName] = useState('Petugas Pembagian MBB');
  const [petugasPassword, setPetugasPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim() || !password) {
      setErrorMsg('Username dan kata sandi wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch<{ ok: true; token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setAuthToken(data.token);
      onAuthenticated(data.user);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleInitialSetup(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (adminPassword.length < 6) {
      setErrorMsg('Kata sandi Admin minimal 6 karakter.');
      return;
    }
    if (createInitialPetugas && petugasPassword.length < 6) {
      setErrorMsg('Kata sandi Petugas minimal 6 karakter.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        username: adminUsername.trim(),
        nama_lengkap: adminName.trim(),
        password: adminPassword,
        ...(createInitialPetugas
          ? {
              petugas_username: petugasUsername.trim(),
              petugas_nama: petugasName.trim(),
              petugas_password: petugasPassword,
            }
          : {}),
      };

      const data = await apiFetch<{ ok: true; token: string; user: AuthUser }>(
        '/api/auth/setup-admin',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      setAuthToken(data.token);
      onSetupCompleted();
      onAuthenticated(data.user);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal menyelesaikan aktivasi awal.');
    } finally {
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
              peran Admin dan Petugas Pembagian Makanan dengan pencatatan waktu WIB secara real-time.
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
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
          {needsInitialSetup ? (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900">
                  Aktivasi Akun Admin Pertama
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Belum ada akun terdaftar di database. Buat akun Admin utama untuk mulai mengelola
                  aplikasi MBB.
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                >
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleInitialSetup} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="setup-admin-user"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Username Admin
                    </label>
                    <input
                      id="setup-admin-user"
                      type="text"
                      required
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
                      placeholder="admin"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="setup-admin-name"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Nama Lengkap Admin
                    </label>
                    <input
                      id="setup-admin-name"
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
                      placeholder="Administrator MBB"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="setup-admin-pass"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Kata Sandi Admin (min. 6 karakter)
                  </label>
                  <div className="relative">
                    <input
                      id="setup-admin-pass"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full px-3 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
                      placeholder="Buat kata sandi Admin"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={createInitialPetugas}
                      onChange={(e) => setCreateInitialPetugas(e.target.checked)}
                      className="w-4 h-4 accent-emerald-800 rounded"
                    />
                    Sekaligus buat akun Petugas Pembagian Makanan pertama
                  </label>

                  {createInitialPetugas && (
                    <div className="mt-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="setup-petugas-user"
                            className="block text-xs font-medium text-slate-700 mb-1"
                          >
                            Username Petugas
                          </label>
                          <input
                            id="setup-petugas-user"
                            type="text"
                            required={createInitialPetugas}
                            value={petugasUsername}
                            onChange={(e) => setPetugasUsername(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="setup-petugas-name"
                            className="block text-xs font-medium text-slate-700 mb-1"
                          >
                            Nama Lengkap Petugas
                          </label>
                          <input
                            id="setup-petugas-name"
                            type="text"
                            required={createInitialPetugas}
                            value={petugasName}
                            onChange={(e) => setPetugasName(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="setup-petugas-pass"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Kata Sandi Petugas (min. 6 karakter)
                        </label>
                        <input
                          id="setup-petugas-pass"
                          type={showPassword ? 'text' : 'password'}
                          required={createInitialPetugas}
                          minLength={6}
                          value={petugasPassword}
                          onChange={(e) => setPetugasPassword(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                          placeholder="Buat kata sandi Petugas"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  {submitting ? 'Menyimpan Konfigurasi...' : 'Simpan & Masuk sebagai Admin'}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900">Masuk ke Aplikasi</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Gunakan akun Admin atau Petugas Pembagian Makanan yang terdaftar.
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                >
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="login-username"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Username
                  </label>
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
                    placeholder="Masukkan username Anda"
                  />
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 pr-11 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
                      placeholder="Masukkan kata sandi"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  {submitting ? 'Memverifikasi...' : 'Masuk'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
