import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Filter } from 'lucide-react';
import { apiFetch, ApiError, downloadExcelFile } from '../api/client';
import type { RecapData } from '../types';
import { addDaysWib, formatIndonesianDate, getWibDateString } from '../utils/wib';

interface RekapitulasiViewProps {
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function RekapitulasiView({ onNotify }: RekapitulasiViewProps) {
  const todayWib = getWibDateString();
  const [startDate, setStartDate] = useState(`${todayWib.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(todayWib);
  const [unitFilter, setUnitFilter] = useState('');
  const [units, setUnits] = useState<string[]>([]);
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadUnits = useCallback(async () => {
    try {
      const res = await apiFetch<{ ok: true; units: string[] }>('/api/pegawai');
      setUnits(res.units);
    } catch {
      // ignore
    }
  }, []);

  const loadRecap = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(unitFilter ? { unit: unitFilter } : {}),
      });
      const res = await apiFetch<{ ok: true; recap: RecapData }>(
        `/api/rekapitulasi?${params.toString()}`
      );
      setRecap(res.recap);
    } catch (err) {
      onNotify(
        err instanceof ApiError ? err.message : 'Gagal memuat data rekapitulasi.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, unitFilter, onNotify]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    void loadRecap();
  }, [loadRecap]);

  async function handleExportExcel() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(unitFilter ? { unit: unitFilter } : {}),
      });
      await downloadExcelFile(
        `/api/rekapitulasi/export?${params.toString()}`,
        `Rekap_MBB_PTA_Babel_${startDate}_sd_${endDate}.xlsx`
      );
      onNotify('Berkas Excel rekapitulasi berhasil diunduh.', 'success');
    } catch (err) {
      onNotify(
        err instanceof ApiError ? err.message : 'Gagal mengekspor Excel.',
        'error'
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Rekapitulasi &amp; Ekspor Excel
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Periode {formatIndonesianDate(startDate)} s.d. {formatIndonesianDate(endDate)}
          </p>
        </div>

        <button
          type="button"
          disabled={exporting || loading}
          onClick={() => void handleExportExcel()}
          className="min-h-[44px] px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Menyiapkan Excel...' : 'Ekspor Excel (.xlsx)'}
        </button>
      </div>

      {/* Filter Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5 mr-1">
            <Filter className="w-3.5 h-3.5" /> Pintasan Periode:
          </span>
          <button
            type="button"
            onClick={() => {
              setStartDate(todayWib);
              setEndDate(todayWib);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => {
              setStartDate(addDaysWib(todayWib, -6));
              setEndDate(todayWib);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            7 Hari Terakhir
          </button>
          <button
            type="button"
            onClick={() => {
              setStartDate(`${todayWib.slice(0, 7)}-01`);
              setEndDate(todayWib);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            Bulan Ini
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="recap-start" className="block text-xs font-medium text-slate-700 mb-1">
              Dari Tanggal
            </label>
            <input
              id="recap-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label htmlFor="recap-end" className="block text-xs font-medium text-slate-700 mb-1">
              Sampai Tanggal
            </label>
            <input
              id="recap-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label htmlFor="recap-unit" className="block text-xs font-medium text-slate-700 mb-1">
              Unit Kerja
            </label>
            <select
              id="recap-unit"
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="">Semua Unit Kerja</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
      {recap && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-medium text-slate-500">Pegawai Tercakup</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {recap.total_pegawai}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-medium text-slate-500">Total Penerimaan Sah</div>
              <div className="mt-1 text-2xl font-bold text-emerald-800 tabular-nums">
                {recap.total_sah}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-medium text-slate-500">Total Dibatalkan</div>
              <div className="mt-1 text-2xl font-bold text-slate-700 tabular-nums">
                {recap.total_dibatalkan}
              </div>
            </div>
          </div>

          {/* Rekap per Unit */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-800" />
              <h3 className="font-semibold text-base text-slate-900">Rekapitulasi per Unit Kerja</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Unit Kerja</th>
                    <th className="px-4 py-3 text-right">Jumlah Pegawai</th>
                    <th className="px-4 py-3 text-right">Penerimaan Sah</th>
                    <th className="px-4 py-3 text-right">Dibatalkan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recap.per_unit.map((u) => (
                    <tr key={u.unit_kerja} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{u.unit_kerja}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {u.jumlah_pegawai}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-emerald-800">
                        {u.total_sah}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">
                        {u.total_dibatalkan}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rekap per Pegawai */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-base text-slate-900">
                Rekapitulasi per Pegawai
              </h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {recap.per_pegawai.length} pegawai
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Kode</th>
                    <th className="px-4 py-3">Nama Lengkap</th>
                    <th className="px-4 py-3">Unit Kerja</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total Sah</th>
                    <th className="px-4 py-3 text-right">Terakhir Terima (WIB)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recap.per_pegawai.map((row) => (
                    <tr key={row.pegawai_id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                        {row.kode_pegawai}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {row.nama_lengkap}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{row.unit_kerja}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-xs font-medium ${
                            row.is_active === 1 ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {row.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {row.jumlah_sah}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">
                        {row.terakhir_terima ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
