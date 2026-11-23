export type UserRole = 'admin' | 'petugas';

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  nama_lengkap: string;
  role: UserRole;
  is_active: number;
}

export interface StaffInvite {
  id: string;
  email: string;
  nama_lengkap: string;
  role: UserRole;
  is_active: number;
  uid?: string | null;
  created_at?: string;
}

export interface Pegawai {
  id: string;
  kode_pegawai: string;
  nama_lengkap: string;
  unit_kerja: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  // Optional today receipt fields when fetched for distribution screen
  penerimaan_id?: string | null;
  waktu_terima?: string | null;
  petugas_nama?: string | null;
}

export type PenerimaanStatus = 'sah' | 'dibatalkan' | 'dikoreksi';

export interface PenerimaanRecord {
  id: string;
  pegawai_id: string;
  kode_pegawai: string;
  nama_lengkap: string;
  unit_kerja: string;
  tanggal_terima: string;
  waktu_terima: string;
  petugas_id: string;
  petugas_nama: string;
  status: PenerimaanStatus;
  catatan: string | null;
  dikoreksi_oleh: string | null;
  dikoreksi_oleh_nama: string | null;
  alasan_koreksi: string | null;
  waktu_koreksi: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  penerimaan_id: string | null;
  pegawai_id: string | null;
  aktor_id: string;
  aktor_nama: string;
  aksi: string;
  alasan: string | null;
  data_sebelum: Record<string, unknown> | string | null;
  data_sesudah: Record<string, unknown> | string | null;
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
  pegawai_id: string;
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
