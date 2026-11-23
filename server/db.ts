import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getWibDateTimeString } from '../src/utils/wib';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'mbb.db');

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      nama_lengkap TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'petugas')),
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pegawai (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode_pegawai TEXT UNIQUE NOT NULL,
      nama_lengkap TEXT NOT NULL,
      unit_kerja TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS penerimaan_makanan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pegawai_id INTEGER NOT NULL REFERENCES pegawai(id),
      tanggal_terima TEXT NOT NULL,
      waktu_terima TEXT NOT NULL,
      petugas_id INTEGER NOT NULL REFERENCES users(id),
      petugas_nama TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sah' CHECK(status IN ('sah', 'dibatalkan', 'dikoreksi')),
      catatan TEXT,
      dikoreksi_oleh INTEGER REFERENCES users(id),
      dikoreksi_oleh_nama TEXT,
      alasan_koreksi TEXT,
      waktu_koreksi TEXT,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_sah_per_day
      ON penerimaan_makanan(pegawai_id, tanggal_terima)
      WHERE status = 'sah';

    CREATE INDEX IF NOT EXISTS idx_penerimaan_tanggal
      ON penerimaan_makanan(tanggal_terima);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      penerimaan_id INTEGER REFERENCES penerimaan_makanan(id),
      pegawai_id INTEGER REFERENCES pegawai(id),
      aktor_id INTEGER NOT NULL REFERENCES users(id),
      aktor_nama TEXT NOT NULL,
      aksi TEXT NOT NULL,
      alasan TEXT,
      data_sebelum TEXT,
      data_sesudah TEXT,
      waktu_wib TEXT NOT NULL
    );
  `);

  seedInitialPegawai(db);
  dbInstance = db;
  return db;
}

function seedInitialPegawai(db: Database.Database): void {
  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM pegawai').get() as { cnt: number };
  if (countRow.cnt > 0) return;

  const now = getWibDateTimeString();
  const initialEmployees: Array<[string, string, string]> = [
    ['MBB-001', 'Dr. H. Ahmad Zaki, S.H., M.H.', 'Pimpinan & Hakim Tinggi'],
    ['MBB-002', 'Dra. Hj. Siti Aminah, M.H.', 'Pimpinan & Hakim Tinggi'],
    ['MBB-003', 'H. Muhammad Yusuf, S.Ag., M.H.', 'Pimpinan & Hakim Tinggi'],
    ['MBB-004', 'Drs. H. Ridwan Mansyur', 'Kepaniteraan'],
    ['MBB-005', 'Hj. Nurhasanah, S.H.', 'Kepaniteraan'],
    ['MBB-006', 'Rizky Pratama, S.H., M.H.', 'Kepaniteraan'],
    ['MBB-007', 'Dewi Anggraini, S.H.', 'Kepaniteraan'],
    ['MBB-008', 'Hendra Wijaya, S.E., M.M.', 'Kesekretariatan'],
    ['MBB-009', 'Fajar Kurniawan, S.Kom.', 'Subbagian Kepegawaian & TI'],
    ['MBB-010', 'Melati Puspita, S.Psi.', 'Subbagian Kepegawaian & TI'],
    ['MBB-011', 'Agus Salim, S.E.', 'Subbagian Keuangan & Pelaporan'],
    ['MBB-012', 'Rina Oktaviani, S.Ak.', 'Subbagian Keuangan & Pelaporan'],
    ['MBB-013', 'Bambang Hermanto, S.T.', 'Subbagian Rencana Program & Anggaran'],
    ['MBB-014', 'Sri Wahyuni, S.Sos.', 'Subbagian Tata Usaha & Rumah Tangga'],
    ['MBB-015', 'Dedi Iskandar', 'Subbagian Tata Usaha & Rumah Tangga'],
    ['MBB-016', 'Yulianti Saputri', 'PPNPN & Pramubakti'],
    ['MBB-017', 'Rahmat Hidayat', 'PPNPN & Pramubakti'],
    ['MBB-018', 'Suherman', 'PPNPN & Pramubakti'],
  ];

  const insert = db.prepare(
    'INSERT INTO pegawai (kode_pegawai, nama_lengkap, unit_kerja, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const [kode, nama, unit] of initialEmployees) {
      insert.run(kode, nama, unit, now, now);
    }
  });
  tx();
}
