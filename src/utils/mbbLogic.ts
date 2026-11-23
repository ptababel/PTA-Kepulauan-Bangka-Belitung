import type { Pegawai, UnitStat } from '../types';

export interface EmployeeFilterOptions {
  search: string;
  unit: string;
  status?: 'all' | 'sudah' | 'belum';
  activeFilter?: 'all' | 'active' | 'inactive';
}

export function filterEmployees(list: Pegawai[], opts: EmployeeFilterOptions): Pegawai[] {
  const query = opts.search.trim().toLowerCase();
  const unitFilter = opts.unit.trim().toLowerCase();
  const statusFilter = opts.status ?? 'all';
  const activeFilter = opts.activeFilter ?? 'all';

  return list.filter((emp) => {
    const matchesQuery =
      !query ||
      emp.nama_lengkap.toLowerCase().includes(query) ||
      emp.kode_pegawai.toLowerCase().includes(query) ||
      emp.unit_kerja.toLowerCase().includes(query);

    const matchesUnit = !unitFilter || emp.unit_kerja.toLowerCase() === unitFilter;

    const isReceived = Boolean(emp.penerimaan_id);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'sudah' && isReceived) ||
      (statusFilter === 'belum' && !isReceived);

    const matchesActive =
      activeFilter === 'all' ||
      (activeFilter === 'active' && emp.is_active === 1) ||
      (activeFilter === 'inactive' && emp.is_active === 0);

    return matchesQuery && matchesUnit && matchesStatus && matchesActive;
  });
}

export interface RawImportRow {
  [key: string]: unknown;
}

export interface ParsedEmployeeImportRow {
  rowNumber: number;
  kode_pegawai: string;
  nama_lengkap: string;
  unit_kerja: string;
  valid: boolean;
  reason?: string;
}

function getFieldCaseInsensitive(row: RawImportRow, candidates: string[]): string {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const found = entries.find(
      ([key]) => key.trim().toLowerCase().replace(/[\s_]+/g, '') === candidate
    );
    if (found && found[1] !== undefined && found[1] !== null) {
      return String(found[1]).trim();
    }
  }
  return '';
}

export function parseExcelEmployeeRows(rows: RawImportRow[]): ParsedEmployeeImportRow[] {
  const seenKey = new Set<string>();

  return rows.map((row, idx) => {
    const rowNumber = idx + 2; // Excel row assuming header on row 1
    const nama_lengkap = getFieldCaseInsensitive(row, [
      'namalengkap',
      'nama',
      'namapegawai',
      'pegawai',
    ]);
    const unit_kerja = getFieldCaseInsensitive(row, [
      'unitkerja',
      'unit',
      'bagian',
      'bidang',
      'divisi',
    ]);
    const kode_pegawai = getFieldCaseInsensitive(row, [
      'kodepegawai',
      'kode',
      'nip',
      'idpegawai',
    ]);

    if (!nama_lengkap || nama_lengkap.length < 2) {
      return {
        rowNumber,
        kode_pegawai,
        nama_lengkap,
        unit_kerja,
        valid: false,
        reason: 'Nama lengkap kosong atau terlalu pendek',
      };
    }

    if (!unit_kerja) {
      return {
        rowNumber,
        kode_pegawai,
        nama_lengkap,
        unit_kerja,
        valid: false,
        reason: 'Unit kerja tidak boleh kosong',
      };
    }

    const dedupKey = kode_pegawai
      ? `kode:${kode_pegawai.toLowerCase()}`
      : `nama:${nama_lengkap.toLowerCase()}|${unit_kerja.toLowerCase()}`;

    if (seenKey.has(dedupKey)) {
      return {
        rowNumber,
        kode_pegawai,
        nama_lengkap,
        unit_kerja,
        valid: false,
        reason: 'Duplikat di dalam file Excel',
      };
    }

    seenKey.add(dedupKey);
    return {
      rowNumber,
      kode_pegawai,
      nama_lengkap,
      unit_kerja,
      valid: true,
    };
  });
}

export function computeDistributionStats(employees: Pegawai[]): {
  total_aktif: number;
  sudah_terima: number;
  belum_terima: number;
  persentase: number;
  per_unit: UnitStat[];
} {
  const active = employees.filter((e) => e.is_active === 1);
  const total_aktif = active.length;
  const sudah_terima = active.filter((e) => Boolean(e.penerimaan_id)).length;
  const belum_terima = total_aktif - sudah_terima;
  const persentase = total_aktif > 0 ? Math.round((sudah_terima / total_aktif) * 100) : 0;

  const map = new Map<string, { total: number; sudah: number }>();
  for (const emp of active) {
    const cur = map.get(emp.unit_kerja) ?? { total: 0, sudah: 0 };
    cur.total += 1;
    if (emp.penerimaan_id) cur.sudah += 1;
    map.set(emp.unit_kerja, cur);
  }

  const per_unit: UnitStat[] = Array.from(map.entries())
    .map(([unit_kerja, val]) => ({
      unit_kerja,
      total_pegawai: val.total,
      sudah_terima: val.sudah,
      belum_terima: val.total - val.sudah,
      persentase: val.total > 0 ? Math.round((val.sudah / val.total) * 100) : 0,
    }))
    .sort((a, b) => a.unit_kerja.localeCompare(b.unit_kerja, 'id'));

  return {
    total_aktif,
    sudah_terima,
    belum_terima,
    persentase,
    per_unit,
  };
}

export function formatNextKodePegawai(existingCodes: string[]): string {
  let maxNum = 0;
  for (const code of existingCodes) {
    const m = /^MBB-(\d+)$/i.exec(code.trim());
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `MBB-${String(maxNum + 1).padStart(3, '0')}`;
}
