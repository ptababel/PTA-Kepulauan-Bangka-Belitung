export type UserRole = 'admin' | 'petugas';

export interface AuthUser {
  id: number;
  username: string;
  nama_lengkap: string;
  role: UserRole;
  is_active: number;
}

export interface Pegawai {
  id: number;
  kode_pegawai: string;
  nama_lengkap: string;
  unit_kerja: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  // Optional today receipt fields when fetched for distribution screen
  penerimaan_id?: number | null;
  waktu_terima?: string | null;
  petugas_nama?: string | null;
}

export type PenerimaanStatus = 'sah' | 'dibatalkan' | 'dikoreksi';

export interface PenerimaanRecord {
  id: number;
  pegawai_id: number;
  kode_pegawai: string;
  nama_lengkap: string;
  unit_kerja: string;
  tanggal_terima: string;
  waktu_terima: string;
  petugas_id: number;
  petugas_nama: string;
  status: PenerimaanStatus;
  catatan: string | null;
  dikoreksi_oleh: number | null;
  dikoreksi_oleh_nama: string | null;
  alasan_koreksi: string | null;
  waktu_koreksi: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  penerimaan_id: number | null;
  pegawai_id: number | null;
  aktor_id: number;
  aktor_nama: string;
  aksi: string;
  alasan: string | null;
  data_sebelum: string | null;
  data_sesudah: string | null;
  waktu_wib: string;
}

export interface UnitStat {
  unit_kerja: string;
  total_pegawai: number;
  sudah_terima: number;
  belum_terima: number;
  persentase: number;
}

export interface DashboardData {
  tanggal_wib: string;
  total_aktif: number;
  sudah_terima: number;
  belum_terima: number;
  persentase: number;
  per_unit: UnitStat[];
  recent_penerimaan: PenerimaanRecord[];
  tren_harian: Array<{
    tanggal: string;
    total_sah: number;
  }>;
}

export interface EmployeeRecapRow {
  pegawai_id: number;
  kode_pegawai: string;
  nama_lengkap: string;
  unit_kerja: string;
  is_active: number;
  jumlah_sah: number;
  jumlah_dibatalkan: number;
  terakhir_terima: string | null;
}

export interface RecapData {
  startDate: string;
  endDate: string;
  total_pegawai: number;
  total_sah: number;
  total_dibatalkan: number;
  per_unit: Array<{
    unit_kerja: string;
    jumlah_pegawai: number;
    total_sah: number;
    total_dibatalkan: number;
  }>;
  per_pegawai: EmployeeRecapRow[];
}

export type NavTab =
  | 'dashboard'
  | 'penerimaan'
  | 'pegawai'
  | 'riwayat'
  | 'rekapitulasi';
