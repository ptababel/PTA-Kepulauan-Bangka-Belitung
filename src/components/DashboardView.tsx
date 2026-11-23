import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, RefreshCw, Users } from 'lucide-react';
import { apiFetch, ApiError } from '../api/client';
import type { DashboardData, NavTab } from '../types';
import { extractWibTime, formatIndonesianDate } from '../utils/wib';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ ok: true; dashboard: DashboardData }>('/api/dashboard');
      setData(res.dashboard);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat ringkasan dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="bg-white border border-slate-200 rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 h-64 animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-center space-y-3">
        <p className="text-sm text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="px-4 py-2 text-sm font-medium bg-emerald-800 text-white rounded-lg hover:bg-emerald-900"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 text-balance">
            Ringkasan Makan Berkah Bersama
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Hari ini · {formatIndonesianDate(data.tanggal_wib)} (Zona Waktu WIB)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
          <button
            type="button"
            onClick={() => onNavigate('penerimaan')}
            className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            Catat Penerimaan
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pegawai Aktif</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">
            {data.total_aktif}
          </div>
          <p className="mt-1 text-xs text-slate-500">Penerima MBB terdaftar</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Sudah Diterima</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-3xl font-bold text-emerald-800 tabular-nums">
            {data.sudah_terima}
          </div>
          <p className="mt-1 text-xs text-slate-500">Tercatat sah hari ini</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Belum Diterima</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-amber-700 tabular-nums">
            {data.belum_terima}
          </div>
          <p className="mt-1 text-xs text-slate-500">Menunggu penyerahan</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Persentase Serapan</span>
            <span className="font-mono text-xs text-slate-500">WIB</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">
            {data.persentase}%
          </div>
          <div className="mt-2.5 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-700 transition-all duration-300"
              style={{ width: `${data.persentase}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Progress per Unit Kerja */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-base text-slate-900">
              Capaian per Unit Kerja Hari Ini
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {data.per_unit.length} unit
            </span>
          </div>

          {data.per_unit.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Belum ada data pegawai aktif terdaftar.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.per_unit.map((u) => (
                <div key={u.unit_kerja} className="px-5 py-3.5 hover:bg-slate-50/70">
                  <div className="flex items-center justify-between gap-4 mb-1.5">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {u.unit_kerja}
                    </span>
                    <span className="text-xs font-mono text-slate-600 tabular-nums shrink-0">
                      {u.sudah_terima} / {u.total_pegawai} ({u.persentase}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-700"
                      style={{ width: `${u.persentase}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Aktivitas Terbaru & Tren 7 Hari */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-base text-slate-900">
                Penerimaan Terbaru Hari Ini
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('riwayat')}
                className="text-xs font-medium text-emerald-800 hover:underline whitespace-nowrap"
              >
                Lihat semua
              </button>
            </div>

            {data.recent_penerimaan.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm text-slate-600">
                  Belum ada makanan yang dicatat diterima hari ini.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('penerimaan')}
                  className="text-xs font-semibold text-emerald-800 hover:underline"
                >
                  Buka daftar penerimaan
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.recent_penerimaan.map((item) => (
                  <div key={item.id} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {item.nama_lengkap}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {item.unit_kerja} · Petugas: {item.petugas_nama}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-medium text-slate-800 tabular-nums">
                        {extractWibTime(item.waktu_terima)}
                      </div>
                      <div
                        className={`text-xs font-medium ${
                          item.status === 'sah'
                            ? 'text-emerald-700'
                            : item.status === 'dibatalkan'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {item.status === 'sah'
                          ? 'Sah'
                          : item.status === 'dibatalkan'
                            ? 'Dibatalkan'
                            : 'Dikoreksi'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-semibold text-base text-slate-900 mb-3">
              Tren 7 Hari Terakhir (WIB)
            </h3>
            <div className="space-y-2">
              {data.tren_harian.map((day) => {
                const maxVal = Math.max(data.total_aktif, 1);
                const pct = Math.min(100, Math.round((day.total_sah / maxVal) * 100));
                return (
                  <div key={day.tanggal} className="flex items-center gap-3 text-xs">
                    <span className="font-mono tabular-nums text-slate-600 w-24 shrink-0">
                      {day.tanggal}
                    </span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-slate-800 w-8 text-right">
                      {day.total_sah}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
