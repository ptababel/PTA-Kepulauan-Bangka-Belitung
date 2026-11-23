import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import ExcelJS from 'exceljs';
import {
  Download,
  Edit3,
  FileUp,
  Plus,
  Shield,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  createPegawai,
  createStaffInvite,
  fetchPegawaiWithToday,
  fetchStaffAccounts,
  getFriendlyErrorMessage,
  importPegawaiRows,
  subscribePegawaiWithToday,
  togglePegawaiStatus,
  toggleStaffInviteStatus,
  updatePegawai,
} from '../services/mbbFirestore';
import type { AuthUser, Pegawai, StaffInvite } from '../types';
import {
  filterEmployees,
  parseExcelEmployeeRows,
  type ParsedEmployeeImportRow,
  type RawImportRow,
} from '../utils/mbbLogic';
import { PegawaiDropdown } from './PegawaiDropdown';

interface KelolaPegawaiViewProps {
  currentUser: AuthUser;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function KelolaPegawaiView({ currentUser, onNotify }: KelolaPegawaiViewProps) {
  const [subTab, setSubTab] = useState<'pegawai' | 'akun'>('pegawai');

  // Pegawai state
  const [pegawaiList, setPegawaiList] = useState<Pegawai[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Add/Edit Pegawai Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Pegawai | null>(null);
  const [formKode, setFormKode] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [savingEmp, setSavingEmp] = useState(false);

  // Import Excel Modal
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ParsedEmployeeImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);

  // Accounts state (Petugas & Admin via Google Email)
  const [accounts, setAccounts] = useState<StaffInvite[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accEmail, setAccEmail] = useState('');
  const [accNama, setAccNama] = useState('');
  const [accRole, setAccRole] = useState<'petugas' | 'admin'>('petugas');
  const [savingAcc, setSavingAcc] = useState(false);

  const loadPegawai = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPegawaiWithToday('admin');
      setPegawaiList(res.pegawai);
      setUnits(res.units);
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal memuat data pegawai.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const list = await fetchStaffAccounts();
      setAccounts(list);
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal memuat daftar akun.'), 'error');
    } finally {
      setLoadingAccounts(false);
    }
  }, [onNotify]);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribePegawaiWithToday(
      'admin',
      (res) => {
        setPegawaiList(res.pegawai);
        setUnits(res.units);
        setLoading(false);
      },
      (err) => {
        onNotify(getFriendlyErrorMessage(err, 'Gagal menyinkronkan data pegawai.'), 'error');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [onNotify]);

  useEffect(() => {
    if (subTab === 'akun') {
      void loadAccounts();
    }
  }, [subTab, loadAccounts]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (formOpen && !savingEmp) setFormOpen(false);
        if (importOpen && !importing) setImportOpen(false);
        if (accountModalOpen && !savingAcc) setAccountModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formOpen, savingEmp, importOpen, importing, accountModalOpen, savingAcc]);

  const filtered = useMemo(
    () =>
      filterEmployees(pegawaiList, {
        search,
        unit: unitFilter,
        activeFilter,
      }),
    [pegawaiList, search, unitFilter, activeFilter]
  );

  function openAddModal() {
    setEditingEmp(null);
    setFormKode('');
    setFormNama('');
    setFormUnit(units[0] ?? '');
    setFormOpen(true);
  }

  function openEditModal(emp: Pegawai) {
    setEditingEmp(emp);
    setFormKode(emp.kode_pegawai);
    setFormNama(emp.nama_lengkap);
    setFormUnit(emp.unit_kerja);
    setFormOpen(true);
  }

  async function handleSavePegawai(e: FormEvent) {
    e.preventDefault();
    if (!formNama.trim() || !formUnit.trim()) {
      onNotify('Nama lengkap dan unit kerja wajib diisi.', 'error');
      return;
    }

    setSavingEmp(true);
    try {
      if (editingEmp) {
        const message = await updatePegawai(
          editingEmp,
          { nama_lengkap: formNama.trim(), unit_kerja: formUnit.trim() },
          currentUser
        );
        onNotify(message, 'success');
      } else {
        const message = await createPegawai(
          {
            kode_pegawai: formKode.trim() || undefined,
            nama_lengkap: formNama.trim(),
            unit_kerja: formUnit.trim(),
          },
          currentUser
        );
        onNotify(message, 'success');
      }
      setFormOpen(false);
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal menyimpan data pegawai.'), 'error');
    } finally {
      setSavingEmp(false);
    }
  }

  async function handleTogglePegawaiStatus(emp: Pegawai) {
    const nextActive = emp.is_active === 1 ? 0 : 1;
    try {
      const message = await togglePegawaiStatus(emp, nextActive, currentUser);
      onNotify(message, 'success');
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal mengubah status pegawai.'), 'error');
    }
  }

  async function handleDownloadTemplate() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Template Pegawai');
    ws.columns = [
      { header: 'Kode Pegawai', key: 'kode', width: 16 },
      { header: 'Nama Lengkap', key: 'nama', width: 32 },
      { header: 'Unit Kerja', key: 'unit', width: 28 },
    ];
    ws.addRow({
      kode: 'MBB-101',
      nama: 'Contoh Nama Pegawai, S.H.',
      unit: 'Kepaniteraan',
    });
    ws.addRow({
      kode: '',
      nama: 'Contoh Pegawai Kedua',
      unit: 'Kesekretariatan',
    });
    ws.getRow(1).font = { bold: true };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Template_Import_Pegawai_MBB.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onNotify('Template Excel berhasil diunduh.', 'success');
  }

  async function handleExcelFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      let rawRows: RawImportRow[] = [];

      if (lower.endsWith('.csv')) {
        const text = await file.text();
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length >= 2) {
          const splitCsvLine = (line: string) =>
            line.split(/[,;](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) =>
              c.trim().replace(/^"|"$/g, '')
            );
          const headers = splitCsvLine(lines[0]);
          rawRows = lines.slice(1).map((line) => {
            const cols = splitCsvLine(line);
            const obj: RawImportRow = {};
            headers.forEach((h, i) => {
              obj[h] = cols[i] ?? '';
            });
            return obj;
          });
        }
      } else {
        const buffer = await file.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) {
          onNotify('Berkas Excel tidak memiliki lembar kerja.', 'error');
          return;
        }
        const headers: string[] = [];
        ws.eachRow((row, rowNum) => {
          if (rowNum === 1) {
            row.eachCell((cell, colNumber) => {
              headers[colNumber] = String(cell.text ?? cell.value ?? '').trim();
            });
          } else {
            const obj: RawImportRow = {};
            let hasVal = false;
            headers.forEach((h, colNumber) => {
              if (!h) return;
              const cell = row.getCell(colNumber);
              const val = String(cell.text ?? cell.value ?? '').trim();
              if (val) hasVal = true;
              obj[h] = val;
            });
            if (hasVal) rawRows.push(obj);
          }
        });
      }

      const parsed = parseExcelEmployeeRows(rawRows);
      setImportPreview(parsed);
    } catch {
      onNotify('Gagal membaca berkas Excel. Pastikan format .xlsx atau .csv valid.', 'error');
      setImportPreview([]);
    }
  }

  async function handleConfirmImport() {
    const validRows = importPreview.filter((r) => r.valid);
    if (validRows.length === 0) {
      onNotify('Tidak ada baris valid untuk diimpor.', 'error');
      return;
    }

    setImporting(true);
    try {
      const res = await importPegawaiRows(
        validRows.map((r) => ({
          kode_pegawai: r.kode_pegawai || undefined,
          nama_lengkap: r.nama_lengkap,
          unit_kerja: r.unit_kerja,
        })),
        currentUser
      );
      onNotify(res.message, 'success');
      setImportOpen(false);
      setImportPreview([]);
      setImportFileName('');
      await loadPegawai();
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal mengimpor data pegawai.'), 'error');
    } finally {
      setImporting(false);
    }
  }

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    setSavingAcc(true);
    try {
      const message = await createStaffInvite(
        {
          email: accEmail.trim(),
          nama_lengkap: accNama.trim(),
          role: accRole,
        },
        currentUser
      );
      onNotify(message, 'success');
      setAccountModalOpen(false);
      setAccEmail('');
      setAccNama('');
      setAccRole('petugas');
      await loadAccounts();
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal menambahkan akun.'), 'error');
    } finally {
      setSavingAcc(false);
    }
  }

  async function handleToggleAccount(acc: StaffInvite) {
    try {
      const nextActive = acc.is_active === 1 ? 0 : 1;
      const message = await toggleStaffInviteStatus(acc, nextActive);
      onNotify(message, 'success');
      await loadAccounts();
    } catch (err) {
      onNotify(getFriendlyErrorMessage(err, 'Gagal mengubah status akun.'), 'error');
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Header + Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Kelola Pegawai &amp; Akun</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Klik <strong>Edit</strong> untuk mengganti nama/unit kerja pegawai atau gunakan{' '}
            <strong>Import Excel</strong> — tersimpan permanen di Firebase Firestore.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('pegawai')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'pegawai'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daftar Pegawai ({pegawaiList.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('akun')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'akun'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Akun Petugas &amp; Admin
          </button>
        </div>
      </div>

      {subTab === 'pegawai' ? (
        <>
          {/* Action & Filter Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openAddModal}
                  className="min-h-[42px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Pegawai
                </button>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="min-h-[42px] px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <FileUp className="w-4 h-4 text-emerald-800" />
                  Import Excel
                </button>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="min-h-[40px] px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh Template Excel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
              <div className="md:col-span-5">
                <PegawaiDropdown
                  id="admin-pegawai-search"
                  label="Pilih atau cari pegawai"
                  pegawaiList={pegawaiList}
                  value={search}
                  onChange={setSearch}
                  placeholder="Pilih atau cari nama / kode pegawai..."
                  heightClass="min-h-[42px]"
                />
              </div>
              <div className="md:col-span-4">
                <label htmlFor="admin-pegawai-unit" className="sr-only">
                  Filter unit kerja
                </label>
                <select
                  id="admin-pegawai-unit"
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
              <div className="md:col-span-3">
                <label htmlFor="admin-pegawai-status" className="sr-only">
                  Filter status aktif
                </label>
                <select
                  id="admin-pegawai-status"
                  value={activeFilter}
                  onChange={(e) =>
                    setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')
                  }
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="all">Semua Status</option>
                  <option value="active">Aktif Saja</option>
                  <option value="inactive">Nonaktif Saja</option>
                </select>
              </div>
            </div>
          </div>

          {/* Desktop Table + Mobile Cards */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading && pegawaiList.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat data pegawai...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Users className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-600">Tidak ada data pegawai yang ditemukan.</p>
              </div>
            ) : (
              <>
                {/* Desktop / Tablet Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Kode</th>
                        <th className="px-4 py-3">Nama Lengkap</th>
                        <th className="px-4 py-3">Unit Kerja</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">
                            {emp.kode_pegawai}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {emp.nama_lengkap}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{emp.unit_kerja}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-semibold ${
                                emp.is_active === 1 ? 'text-emerald-700' : 'text-slate-500'
                              }`}
                            >
                              {emp.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal(emp)}
                                aria-label={`Edit ${emp.nama_lengkap}`}
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleTogglePegawaiStatus(emp)}
                                aria-label={`${
                                  emp.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'
                                } ${emp.nama_lengkap}`}
                                className={`px-2.5 py-1.5 text-xs font-medium border rounded-md inline-flex items-center gap-1 ${
                                  emp.is_active === 1
                                    ? 'text-red-700 border-red-200 bg-red-50/60 hover:bg-red-100'
                                    : 'text-emerald-800 border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100'
                                }`}
                              >
                                {emp.is_active === 1 ? (
                                  <>
                                    <UserX className="w-3.5 h-3.5" />
                                    Nonaktifkan
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5" />
                                    Aktifkan
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filtered.map((emp) => (
                    <div key={emp.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">{emp.nama_lengkap}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className="font-mono">{emp.kode_pegawai}</span> · {emp.unit_kerja}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            emp.is_active === 1 ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {emp.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(emp)}
                          className="flex-1 min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center justify-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleTogglePegawaiStatus(emp)}
                          className={`flex-1 min-h-[40px] px-3 py-1.5 text-xs font-medium border rounded-lg inline-flex items-center justify-center gap-1.5 ${
                            emp.is_active === 1
                              ? 'text-red-700 border-red-200 bg-red-50/50'
                              : 'text-emerald-800 border-emerald-200 bg-emerald-50/50'
                          }`}
                        >
                          {emp.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* Akun Petugas & Admin Tab */
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              Daftarkan alamat email Google Petugas Pembagian Makanan atau Administrator tambahan
              agar dapat masuk menggunakan tombol Login Google.
            </div>
            <button
              type="button"
              onClick={() => setAccountModalOpen(true)}
              className="min-h-[42px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-semibold rounded-lg flex items-center gap-2 whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              Tambah Akun Petugas / Admin
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loadingAccounts ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat daftar akun...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Email Google</th>
                      <th className="px-4 py-3">Nama Lengkap</th>
                      <th className="px-4 py-3">Peran</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="bg-emerald-50/40">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {BOOTSTRAPPED_ADMIN_EMAIL}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        Administrator Utama PTA Kep. Babel
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                          <Shield className="w-3.5 h-3.5 text-emerald-700" />
                          Admin Utama
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-emerald-700">Aktif</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-slate-400">Admin bawaan</span>
                      </td>
                    </tr>
                    {accounts.map((acc) => (
                      <tr key={acc.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{acc.email}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {acc.nama_lengkap}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                            <Shield className="w-3.5 h-3.5 text-emerald-700" />
                            {acc.role === 'admin' ? 'Admin' : 'Petugas'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-semibold ${
                              acc.is_active === 1 ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {acc.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {acc.email === currentUser.email ? (
                            <span className="text-xs text-slate-400">Akun aktif Anda</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleToggleAccount(acc)}
                              className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-100"
                            >
                              {acc.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Tambah / Edit Pegawai */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pegawai-form-title"
        >
          <form
            onSubmit={handleSavePegawai}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <h3 id="pegawai-form-title" className="text-lg font-bold text-slate-900">
              {editingEmp ? 'Edit Data Pegawai' : 'Tambah Pegawai Baru'}
            </h3>

            {!editingEmp && (
              <div>
                <label
                  htmlFor="pegawai-kode-input"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Kode Pegawai (opsional — otomatis jika kosong)
                </label>
                <input
                  id="pegawai-kode-input"
                  type="text"
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value)}
                  placeholder="Contoh: MBB-019"
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="pegawai-nama-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Nama Lengkap
              </label>
              <input
                id="pegawai-nama-input"
                type="text"
                required
                value={formNama}
                onChange={(e) => setFormNama(e.target.value)}
                placeholder="Nama lengkap beserta gelar"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="pegawai-unit-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Unit Kerja
              </label>
              <input
                id="pegawai-unit-input"
                type="text"
                list="unit-kerja-suggestions"
                required
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
                placeholder="Contoh: Kepaniteraan"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <datalist id="unit-kerja-suggestions">
                {units.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingEmp}
                className="min-h-[42px] px-4 py-2 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 rounded-lg"
              >
                {savingEmp ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Import Excel */}
      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-excel-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div>
              <h3 id="import-excel-title" className="text-lg font-bold text-slate-900">
                Import Daftar Pegawai dari Excel
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Unggah file <code>.xlsx</code>, <code>.xls</code>, atau <code>.csv</code> dengan
                kolom <strong>Nama Lengkap</strong>, <strong>Unit Kerja</strong>, dan opsional{' '}
                <strong>Kode Pegawai</strong>.
              </p>
            </div>

            <div>
              <label
                htmlFor="excel-file-upload"
                className="block w-full border border-dashed border-slate-300 rounded-lg p-5 text-center cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <FileUp className="w-6 h-6 text-emerald-800 mx-auto mb-1.5" />
                <span className="text-sm font-medium text-slate-800 block">
                  {importFileName || 'Pilih berkas Excel (.xlsx / .xls / .csv)'}
                </span>
                <input
                  id="excel-file-upload"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelFileChange}
                  className="sr-only"
                />
              </label>
            </div>

            {importPreview.length > 0 && (
              <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Baris</th>
                      <th className="px-3 py-2">Kode</th>
                      <th className="px-3 py-2">Nama Lengkap</th>
                      <th className="px-3 py-2">Unit Kerja</th>
                      <th className="px-3 py-2">Validasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((r) => (
                      <tr key={r.rowNumber} className={r.valid ? '' : 'bg-red-50/50'}>
                        <td className="px-3 py-2 font-mono">{r.rowNumber}</td>
                        <td className="px-3 py-2 font-mono">{r.kode_pegawai || '(otomatis)'}</td>
                        <td className="px-3 py-2 font-medium">{r.nama_lengkap || '-'}</td>
                        <td className="px-3 py-2">{r.unit_kerja || '-'}</td>
                        <td className="px-3 py-2">
                          {r.valid ? (
                            <span className="text-emerald-700 font-medium">Siap diimpor</span>
                          ) : (
                            <span className="text-red-700">{r.reason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-xs text-slate-500">
                {importPreview.length > 0
                  ? `${importPreview.filter((r) => r.valid).length} valid dari ${importPreview.length} baris`
                  : 'Belum ada file dipilih'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportOpen(false);
                    setImportPreview([]);
                    setImportFileName('');
                  }}
                  className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={importing || importPreview.filter((r) => r.valid).length === 0}
                  onClick={() => void handleConfirmImport()}
                  className="min-h-[40px] px-4 py-2 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-lg"
                >
                  {importing ? 'Mengimpor...' : 'Simpan ke Database'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Akun Petugas / Admin */}
      {accountModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="acc-modal-title"
        >
          <form
            onSubmit={handleCreateAccount}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <h3 id="acc-modal-title" className="text-lg font-bold text-slate-900">
              Daftarkan Email Google Pengguna
            </h3>

            <div>
              <label
                htmlFor="new-acc-email"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Email Akun Google
              </label>
              <input
                id="new-acc-email"
                type="email"
                required
                value={accEmail}
                onChange={(e) => setAccEmail(e.target.value)}
                placeholder="contoh: petugas.mbb@gmail.com"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="new-acc-nama"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Nama Lengkap
              </label>
              <input
                id="new-acc-nama"
                type="text"
                required
                value={accNama}
                onChange={(e) => setAccNama(e.target.value)}
                placeholder="Nama lengkap petugas/admin"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="new-acc-role"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Peran
              </label>
              <select
                id="new-acc-role"
                value={accRole}
                onChange={(e) => setAccRole(e.target.value as 'petugas' | 'admin')}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="petugas">Petugas Pembagian Makanan</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAccountModalOpen(false)}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingAcc}
                className="min-h-[42px] px-4 py-2 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 rounded-lg"
              >
                {savingAcc ? 'Menyimpan...' : 'Daftarkan Akun'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
