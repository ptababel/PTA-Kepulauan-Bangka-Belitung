import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, RefreshCw, Utensils } from 'lucide-react';
import { apiFetch, ApiError } from '../api/client';
import type { AuthUser, Pegawai } from '../types';
import { filterEmployees } from '../utils/mbbLogic';
import { extractWibTime, formatIndonesianDate, getWibDateString } from '../utils/wib';
import { PegawaiDropdown } from './PegawaiDropdown';

interface PenerimaanViewProps {
  user: AuthUser;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function PenerimaanView({ user, onNotify }: PenerimaanViewProps) {
  const [pegawaiList, setPegawaiList] = useState<Pegawai[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [todayWib, setTodayWib] = useState(() => getWibDateString());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'belum' | 'sudah'>('all');

  const [confirmTarget, setConfirmTarget] = useState<Pegawai | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        ok: true;
        today_wib: string;
        pegawai: Pegawai[];
        units: string[];
      }>('/api/pegawai');
      // Only active employees can receive food
      setPegawaiList(res.pegawai.filter((p) => p.is_active === 1));
      setUnits(res.units);
      setTodayWib(res.today_wib);
    } catch (err) {
      onNotify(
        err instanceof ApiError ? err.message : 'Gagal memuat daftar pegawai.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!confirmTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && submittingId === null) {
        setConfirmTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmTarget, submittingId]);

  const filtered = useMemo(
    () =>
      filterEmployees(pegawaiList, {
        search,
        unit: selectedUnit,
        status: statusFilter,
        activeFilter: 'active',
      }),
    [pegawaiList, search, selectedUnit, statusFilter]
  );

  const totalAktif = pegawaiList.length;
  const totalSudah = pegawaiList.filter((p) => Boolean(p.penerimaan_id)).length;
  const totalBelum = totalAktif - totalSudah;

  async function handleConfirmReceipt() {
    if (!confirmTarget) return;
    const target = confirmTarget;
    setSubmittingId(target.id);

    try {
      const res = await apiFetch<{
        ok: true;
        id: number;
        waktu_terima: string;
        jam_wib: string;
        petugas: string;
        message: string;
      }>('/api/penerimaan', {
        method: 'POST',
        body: JSON.stringify({ pegawai_id: target.id }),
      });

      setPegawaiList((prev) =>
        prev.map((item) =>
          item.id === target.id
            ? {
                ...item,
                penerimaan_id: res.id,
                waktu_terima: res.waktu_terima,
                petugas_nama: res.petugas,
              }
            : item
        )
      );
      setConfirmTarget(null);
      onNotify(res.message, 'success');
    } catch (err) {
      setConfirmTarget(null);
      onNotify(
        err instanceof ApiError ? err.message : 'Gagal mencatat penerimaan makanan.',
        'error'
      );
      void loadList();
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header & Quick Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Penyerahan &amp; Penerimaan Makanan
          </h2>
          <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
            {formatIndonesianDate(todayWib)} (WIB) · Sudah diterima:{' '}
            <strong className="text-emerald-800">{totalSudah}</strong> / {totalAktif} · Belum:{' '}
            <strong className="text-amber-700">{totalBelum}</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadList()}
          className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Sinkronkan Data
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <PegawaiDropdown
              id="penerimaan-search"
              label="Pilih atau cari nama pegawai"
              pegawaiList={pegawaiList}
              value={search}
              onChange={setSearch}
              placeholder="Pilih atau cari nama / kode pegawai..."
              showReceiptStatus
            />
          </div>

          <div className="md:col-span-4">
            <label htmlFor="penerimaan-unit" className="sr-only">
              Filter unit kerja
            </label>
            <select
              id="penerimaan-unit"
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              <option value="">Semua Unit Kerja</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <div
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg h-[44px]"
              role="group"
              aria-label="Filter status penerimaan"
            >
              {[
                { key: 'all' as const, label: 'Semua' },
                { key: 'belum' as const, label: 'Belum' },
                { key: 'sudah' as const, label: 'Sudah' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`flex-1 h-full text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === tab.key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Employee Distribution Cards (Responsive 1 col mobile, 2 col tablet, 3 col desktop) */}
      {loading && pegawaiList.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="bg-white border border-slate-200 rounded-xl p-4 h-40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <Utensils className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700">
            Tidak ada pegawai yang sesuai dengan filter pencarian.
          </p>
          {(search || selectedUnit || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedUnit('');
                setStatusFilter('all');
              }}
              className="text-xs font-semibold text-emerald-800 hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((emp) => {
            const received = Boolean(emp.penerimaan_id);
            return (
              <div
                key={emp.id}
                data-testid={`pegawai-card-${emp.id}`}
                className={`border rounded-xl p-4 flex flex-col justify-between gap-4 transition-colors ${
                  received
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-base text-slate-900 leading-snug">
                      {emp.nama_lengkap}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                        received ? 'text-emerald-800' : 'text-amber-700'
                      }`}
                    >
                      {received ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sudah
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          Belum
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="font-mono">{emp.kode_pegawai}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{emp.unit_kerja}</span>
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200/80">
                  {received ? (
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-emerald-800 tabular-nums">
                        Diterima pukul {extractWibTime(emp.waktu_terima)}
                      </div>
                      <div className="text-xs text-slate-600">
                        Petugas: {emp.petugas_nama || user.nama_lengkap}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={submittingId === emp.id}
                      onClick={() => setConfirmTarget(emp)}
                      aria-label={`Sudah Diterima untuk ${emp.nama_lengkap}`}
                      className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Sudah Diterima
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div>
              <h3 id="confirm-dialog-title" className="text-lg font-bold text-slate-900">
                Konfirmasi Penyerahan Makanan
              </h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                Pastikan makanan Makan Berkah Bersama benar-benar telah diserahkan kepada:
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-900">{confirmTarget.nama_lengkap}</div>
              <div className="text-xs text-slate-600 mt-0.5">
                {confirmTarget.kode_pegawai} · {confirmTarget.unit_kerja}
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Sistem akan mencatat tanggal &amp; jam WIB secara otomatis atas nama petugas{' '}
              <strong>{user.nama_lengkap}</strong>.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={submittingId !== null}
                onClick={() => setConfirmTarget(null)}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submittingId !== null}
                onClick={() => void handleConfirmReceipt()}
                className="min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 rounded-lg"
              >
                {submittingId !== null ? 'Menyimpan...' : 'Ya, Sudah Diterima'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
