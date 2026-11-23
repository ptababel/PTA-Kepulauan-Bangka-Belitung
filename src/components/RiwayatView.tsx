import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, History, Search, ShieldAlert } from 'lucide-react';
import {
  correctPenerimaan,
  fetchAuditLogs,
  fetchPegawaiWithToday,
  fetchRiwayatRecords,
  getFriendlyErrorMessage,
} from '../services/mbbFirestore';
import type { AuditLogEntry, AuthUser, PenerimaanRecord } from '../types';
import { addDaysWib, getWibDateString } from '../utils/wib';

interface RiwayatViewProps {
  user: AuthUser;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

function formatAuditPayload(val: Record<string, unknown> | string | null): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

export function RiwayatView({ user, onNotify }: RiwayatViewProps) {
  const todayWib = getWibDateString();
  const [subTab, setSubTab] = useState<'riwayat' | 'audit'>('riwayat');

  const [startDate, setStartDate] = useState(addDaysWib(todayWib, -14));
  const [endDate, setEndDate] = useState(todayWib);
  const [unitFilter, setUnitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [units, setUnits] = useState<string[]>([]);

  const [records, setRecords] = useState<PenerimaanRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin Correction Modal
  const [koreksiTarget, setKoreksiTarget] = useState<PenerimaanRecord | null>(null);
  const [koreksiAction, setKoreksiAction] = useState<'dibatalkan' | 'dikoreksi'>('dibatalkan');
  const [alasanKoreksi, setAlasanKoreksi] = useState('');
  const [submittingKoreksi, setSubmittingKoreksi] = useState(false);

  const loadUnits = useCallback(async () => {
    try {
      const res = await fetchPegawaiWithToday(user.role);
      setUnits(res.units);
    } catch {
      // ignore
    }
  }, [user.role]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchRiwayatRecords({
        startDate,
        endDate,
        unit: unitFilter,
        status: statusFilter,
        search,
      });
      setRecords(rows);
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal memuat riwayat penerimaan.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, unitFilter, statusFilter, search, onNotify]);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const logs = await fetchAuditLogs();
      setAuditLogs(logs);
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal memuat rekam jejak perubahan.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    if (subTab === 'riwayat') {
      void loadRecords();
    } else {
      void loadAuditLogs();
    }
  }, [subTab, loadRecords, loadAuditLogs]);

  useEffect(() => {
    if (!koreksiTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submittingKoreksi) {
        setKoreksiTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [koreksiTarget, submittingKoreksi]);

  async function handleSubmitKoreksi(e: FormEvent) {
    e.preventDefault();
    if (!koreksiTarget) return;
    if (alasanKoreksi.trim().length < 5) {
      onNotify('Alasan koreksi wajib diisi minimal 5 karakter.', 'error');
      return;
    }

    setSubmittingKoreksi(true);
    try {
      const message = await correctPenerimaan(
        koreksiTarget,
        koreksiAction,
        alasanKoreksi.trim(),
        user
      );
      onNotify(message, 'success');
      setKoreksiTarget(null);
      setAlasanKoreksi('');
      await loadRecords();
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal menyimpan koreksi penerimaan.'), 'error');
    } finally {
      setSubmittingKoreksi(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Riwayat Penerimaan &amp; Rekam Jejak
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Catatan penerimaan makanan beserta identitas petugas dan histori koreksi admin.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('riwayat')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'riwayat'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Log Penerimaan
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'audit'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rekam Jejak Perubahan
          </button>
        </div>
      </div>

      {subTab === 'riwayat' ? (
        <>
          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label htmlFor="riwayat-search" className="block text-xs font-medium text-slate-700 mb-1">
                Cari Pegawai / Petugas
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="riwayat-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nama atau kode..."
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label htmlFor="riwayat-start" className="block text-xs font-medium text-slate-700 mb-1">
                Dari Tanggal
              </label>
              <input
                id="riwayat-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label htmlFor="riwayat-end" className="block text-xs font-medium text-slate-700 mb-1">
                Sampai Tanggal
              </label>
              <input
                id="riwayat-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label htmlFor="riwayat-unit" className="block text-xs font-medium text-slate-700 mb-1">
                Unit Kerja
              </label>
              <select
                id="riwayat-unit"
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="">Semua Unit</option>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="riwayat-status" className="block text-xs font-medium text-slate-700 mb-1">
                Status
              </label>
              <select
                id="riwayat-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="">Semua Status</option>
                <option value="sah">Sah</option>
                <option value="dibatalkan">Dibatalkan</option>
                <option value="dikoreksi">Dikoreksi</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat riwayat...</div>
            ) : records.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <History className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-600">
                  Belum ada catatan penerimaan pada rentang tanggal ini.
                </p>
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Waktu Terima (WIB)</th>
                        <th className="px-4 py-3">Pegawai</th>
                        <th className="px-4 py-3">Unit Kerja</th>
                        <th className="px-4 py-3">Petugas Pencatat</th>
                        <th className="px-4 py-3">Status &amp; Keterangan</th>
                        {user.role === 'admin' && <th className="px-4 py-3 text-right">Koreksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/70 align-top">
                          <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                            {rec.waktu_terima} WIB
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{rec.nama_lengkap}</div>
                            <div className="text-xs font-mono text-slate-500">{rec.kode_pegawai}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{rec.unit_kerja}</td>
                          <td className="px-4 py-3 text-slate-700">{rec.petugas_nama}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-semibold ${
                                rec.status === 'sah'
                                  ? 'text-emerald-700'
                                  : rec.status === 'dibatalkan'
                                    ? 'text-red-700'
                                    : 'text-amber-700'
                              }`}
                            >
                              {rec.status === 'sah'
                                ? 'Sah'
                                : rec.status === 'dibatalkan'
                                  ? 'Dibatalkan'
                                  : 'Dikoreksi'}
                            </span>
                            {rec.alasan_koreksi && (
                              <div className="text-xs text-slate-600 mt-1 max-w-xs">
                                Alasan: {rec.alasan_koreksi}
                                {rec.dikoreksi_oleh_nama && (
                                  <span className="block text-slate-400">
                                    Oleh {rec.dikoreksi_oleh_nama} · {rec.waktu_koreksi} WIB
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          {user.role === 'admin' && (
                            <td className="px-4 py-3 text-right">
                              {rec.status === 'sah' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setKoreksiTarget(rec);
                                    setKoreksiAction('dibatalkan');
                                    setAlasanKoreksi('');
                                  }}
                                  aria-label={`Koreksi penerimaan ${rec.nama_lengkap}`}
                                  className="px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 whitespace-nowrap"
                                >
                                  Koreksi / Batalkan
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">Terkoreksi</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden divide-y divide-slate-100">
                  {records.map((rec) => (
                    <div key={rec.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">{rec.nama_lengkap}</div>
                          <div className="text-xs text-slate-500">
                            {rec.kode_pegawai} · {rec.unit_kerja}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            rec.status === 'sah'
                              ? 'text-emerald-700'
                              : rec.status === 'dibatalkan'
                                ? 'text-red-700'
                                : 'text-amber-700'
                          }`}
                        >
                          {rec.status === 'sah'
                            ? 'Sah'
                            : rec.status === 'dibatalkan'
                              ? 'Dibatalkan'
                              : 'Dikoreksi'}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-600 tabular-nums">
                        {rec.waktu_terima} WIB · Petugas: {rec.petugas_nama}
                      </div>
                      {rec.alasan_koreksi && (
                        <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                          Alasan: {rec.alasan_koreksi}
                        </div>
                      )}
                      {user.role === 'admin' && rec.status === 'sah' && (
                        <button
                          type="button"
                          onClick={() => {
                            setKoreksiTarget(rec);
                            setKoreksiAction('dibatalkan');
                            setAlasanKoreksi('');
                          }}
                          className="w-full min-h-[40px] px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg"
                        >
                          Koreksi / Batalkan
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* Audit Log Table */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Memuat rekam jejak...</div>
          ) : auditLogs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada catatan aktivitas atau koreksi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Waktu (WIB)</th>
                    <th className="px-4 py-3">Aktor</th>
                    <th className="px-4 py-3">Aksi</th>
                    <th className="px-4 py-3">Alasan / Keterangan</th>
                    <th className="px-4 py-3">Detail Perubahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 align-top">
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {log.waktu_wib} WIB
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{log.aktor_nama}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                        {log.aksi}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{log.alasan || '-'}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-sm break-words">
                        {log.data_sebelum && <div>Sebelum: {formatAuditPayload(log.data_sebelum)}</div>}
                        {log.data_sesudah && <div>Sesudah: {formatAuditPayload(log.data_sesudah)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Koreksi / Pembatalan Khusus Admin */}
      {koreksiTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="koreksi-modal-title"
        >
          <form
            onSubmit={handleSubmitKoreksi}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 id="koreksi-modal-title" className="text-lg font-bold text-slate-900">
                  Koreksi atau Batalkan Penerimaan
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Tindakan ini akan tersimpan permanen di rekam jejak perubahan (audit trail).
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-sm text-slate-900">
                {koreksiTarget.nama_lengkap}
              </div>
              <div className="text-slate-600">
                {koreksiTarget.unit_kerja} · Waktu tercatat: {koreksiTarget.waktu_terima} WIB
              </div>
              <div className="text-slate-600">Petugas pencatat: {koreksiTarget.petugas_nama}</div>
            </div>

            <div>
              <label
                htmlFor="koreksi-aksi-select"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Jenis Tindakan
              </label>
              <select
                id="koreksi-aksi-select"
                value={koreksiAction}
                onChange={(e) =>
                  setKoreksiAction(e.target.value as 'dibatalkan' | 'dikoreksi')
                }
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="dibatalkan">Batalkan Penerimaan (Salah Klik / Batal)</option>
                <option value="dikoreksi">Tandai Dikoreksi (Catatan Khusus)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="koreksi-alasan-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Alasan Koreksi (wajib, minimal 5 karakter)
              </label>
              <textarea
                id="koreksi-alasan-input"
                required
                minLength={5}
                rows={3}
                value={alasanKoreksi}
                onChange={(e) => setAlasanKoreksi(e.target.value)}
                placeholder="Contoh: Petugas keliru memilih nama pegawai yang sama pada daftar"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Jika dibatalkan, pegawai terkait dapat dicatat ulang penerimaannya hari ini bila
                memang belum menerima.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setKoreksiTarget(null)}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={submittingKoreksi}
                className="min-h-[42px] px-4 py-2 text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60 rounded-lg"
              >
                {submittingKoreksi ? 'Menyimpan...' : 'Simpan Koreksi'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
