import crypto from 'crypto';
import { Router, type Response } from 'express';
import ExcelJS from 'exceljs';
import { getDb } from './db';
import {
  createSessionToken,
  getEnvAdminPasscode,
  hashPassword,
  hasAnyAdmin,
  requireAdmin,
  requireAuth,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth';
import { addDaysWib, getWibDateString, getWibDateTimeString } from '../src/utils/wib';
import { formatNextKodePegawai } from '../src/utils/mbbLogic';
import type { AuthUser, Pegawai, PenerimaanRecord } from '../src/types';

function safeTimingEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function createApiRouter(): Router {
  const router = Router();

  // ── AUTHENTICATION & SETUP ──────────────────────────────────────────────────

  router.get('/auth/status', (_req, res: Response) => {
    const adminExists = hasAnyAdmin();
    const envPasscodeActive = getEnvAdminPasscode().length > 0;
    res.json({
      ok: true,
      needsInitialSetup: !adminExists && !envPasscodeActive,
      envPasscodeActive,
    });
  });

  router.post('/auth/setup-admin', (req, res: Response) => {
    const db = getDb();
    if (hasAnyAdmin() || getEnvAdminPasscode().length > 0) {
      res.status(403).json({
        ok: false,
        message: 'Akun Admin sudah terdaftar. Silakan masuk melalui halaman login.',
      });
      return;
    }

    const {
      username,
      nama_lengkap,
      password,
      petugas_username,
      petugas_nama,
      petugas_password,
    } = req.body ?? {};

    const cleanUser = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const cleanName = typeof nama_lengkap === 'string' ? nama_lengkap.trim() : '';
    const cleanPass = typeof password === 'string' ? password : '';

    if (!/^[a-z0-9._-]{3,32}$/.test(cleanUser)) {
      res.status(400).json({
        ok: false,
        message: 'Username Admin minimal 3 karakter (huruf, angka, titik, atau underscore).',
      });
      return;
    }
    if (cleanName.length < 2) {
      res.status(400).json({ ok: false, message: 'Nama lengkap Admin minimal 2 karakter.' });
      return;
    }
    if (cleanPass.length < 6) {
      res.status(400).json({ ok: false, message: 'Kata sandi Admin minimal 6 karakter.' });
      return;
    }

    const pUser =
      typeof petugas_username === 'string' ? petugas_username.trim().toLowerCase() : '';
    const pName = typeof petugas_nama === 'string' ? petugas_nama.trim() : '';
    const pPass = typeof petugas_password === 'string' ? petugas_password : '';
    const wantPetugas = Boolean(pUser || pName || pPass);

    if (wantPetugas) {
      if (!/^[a-z0-9._-]{3,32}$/.test(pUser) || pUser === cleanUser) {
        res.status(400).json({
          ok: false,
          message: 'Username Petugas tidak valid atau sama dengan Admin.',
        });
        return;
      }
      if (pName.length < 2 || pPass.length < 6) {
        res.status(400).json({
          ok: false,
          message: 'Nama petugas (min 2 karakter) dan kata sandi (min 6 karakter) wajib diisi.',
        });
        return;
      }
    }

    const now = getWibDateTimeString();
    const insertUser = db.prepare(
      'INSERT INTO users (username, nama_lengkap, role, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
    );

    const tx = db.transaction(() => {
      if (hasAnyAdmin()) {
        throw new Error('ALREADY_CLAIMED');
      }
      const adminRes = insertUser.run(cleanUser, cleanName, 'admin', hashPassword(cleanPass), now);
      if (wantPetugas) {
        insertUser.run(pUser, pName, 'petugas', hashPassword(pPass), now);
      }
      return Number(adminRes.lastInsertRowid);
    });

    try {
      const adminId = tx();
      const authUser: AuthUser = {
        id: adminId,
        username: cleanUser,
        nama_lengkap: cleanName,
        role: 'admin',
        is_active: 1,
      };
      const token = createSessionToken({ id: authUser.id, role: authUser.role });
      res.status(201).json({ ok: true, token, user: authUser });
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_CLAIMED') {
        res.status(409).json({ ok: false, message: 'Admin sudah terdaftar.' });
        return;
      }
      res.status(500).json({ ok: false, message: 'Gagal membuat akun Admin awal.' });
    }
  });

  router.post('/auth/login', (req, res: Response) => {
    const db = getDb();
    const { username, password } = req.body ?? {};
    const cleanUser = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const cleanPass = typeof password === 'string' ? password : '';

    if (!cleanUser || !cleanPass) {
      res.status(400).json({ ok: false, message: 'Username dan kata sandi wajib diisi.' });
      return;
    }

    const envAdminPass = getEnvAdminPasscode();
    if (envAdminPass && (cleanUser === 'admin' || cleanUser === 'administrator')) {
      if (safeTimingEqual(cleanPass, envAdminPass)) {
        let adminRow = db
          .prepare(
            "SELECT id, username, nama_lengkap, role, is_active FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1"
          )
          .get() as AuthUser | undefined;

        if (!adminRow) {
          const now = getWibDateTimeString();
          const info = db
            .prepare(
              'INSERT INTO users (username, nama_lengkap, role, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
            )
            .run('admin', 'Administrator MBB', 'admin', hashPassword(envAdminPass), now);
          adminRow = {
            id: Number(info.lastInsertRowid),
            username: 'admin',
            nama_lengkap: 'Administrator MBB',
            role: 'admin',
            is_active: 1,
          };
        }
        const token = createSessionToken({ id: adminRow.id, role: 'admin' });
        res.json({ ok: true, token, user: adminRow });
        return;
      }
    }

    const row = db
      .prepare(
        'SELECT id, username, nama_lengkap, role, password_hash, is_active FROM users WHERE LOWER(username) = ?'
      )
      .get(cleanUser) as (AuthUser & { password_hash: string }) | undefined;

    if (!row || !verifyPassword(cleanPass, row.password_hash)) {
      res.status(401).json({ ok: false, message: 'Username atau kata sandi salah.' });
      return;
    }

    if (row.is_active !== 1) {
      res.status(403).json({
        ok: false,
        message: 'Akun Anda dinonaktifkan. Silakan hubungi Administrator.',
      });
      return;
    }

    const user: AuthUser = {
      id: row.id,
      username: row.username,
      nama_lengkap: row.nama_lengkap,
      role: row.role,
      is_active: row.is_active,
    };
    const token = createSessionToken({ id: user.id, role: user.role });
    res.json({ ok: true, token, user });
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ ok: true, user: req.authUser });
  });

  // ── USER / PETUGAS ACCOUNT MANAGEMENT (ADMIN ONLY) ──────────────────────────

  router.get('/users', requireAuth, requireAdmin, (_req, res: Response) => {
    const db = getDb();
    const users = db
      .prepare(
        'SELECT id, username, nama_lengkap, role, is_active, created_at FROM users ORDER BY role ASC, nama_lengkap ASC'
      )
      .all();
    res.json({ ok: true, users });
  });

  router.post('/users', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const { username, nama_lengkap, role, password } = req.body ?? {};
    const cleanUser = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const cleanName = typeof nama_lengkap === 'string' ? nama_lengkap.trim() : '';
    const cleanRole = role === 'admin' || role === 'petugas' ? role : 'petugas';
    const cleanPass = typeof password === 'string' ? password : '';

    if (!/^[a-z0-9._-]{3,32}$/.test(cleanUser)) {
      res.status(400).json({
        ok: false,
        message: 'Username minimal 3 karakter (huruf, angka, titik, underscore, atau strip).',
      });
      return;
    }
    if (cleanName.length < 2) {
      res.status(400).json({ ok: false, message: 'Nama lengkap minimal 2 karakter.' });
      return;
    }
    if (cleanPass.length < 6) {
      res.status(400).json({ ok: false, message: 'Kata sandi minimal 6 karakter.' });
      return;
    }

    const exists = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(cleanUser);
    if (exists) {
      res.status(409).json({ ok: false, message: 'Username sudah digunakan.' });
      return;
    }

    const now = getWibDateTimeString();
    const info = db
      .prepare(
        'INSERT INTO users (username, nama_lengkap, role, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
      )
      .run(cleanUser, cleanName, cleanRole, hashPassword(cleanPass), now);

    res.status(201).json({
      ok: true,
      message: `Akun ${cleanRole === 'admin' ? 'Admin' : 'Petugas'} berhasil ditambahkan.`,
      user: {
        id: Number(info.lastInsertRowid),
        username: cleanUser,
        nama_lengkap: cleanName,
        role: cleanRole,
        is_active: 1,
        created_at: now,
      },
    });
  });

  router.patch(
    '/users/:id',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const db = getDb();
      const targetId = Number(req.params.id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        res.status(400).json({ ok: false, message: 'ID pengguna tidak valid.' });
        return;
      }

      const target = db
        .prepare('SELECT id, username, nama_lengkap, role, is_active FROM users WHERE id = ?')
        .get(targetId) as AuthUser | undefined;

      if (!target) {
        res.status(404).json({ ok: false, message: 'Pengguna tidak ditemukan.' });
        return;
      }

      const { is_active, password, nama_lengkap } = req.body ?? {};
      const nextActive =
        typeof is_active === 'number' || typeof is_active === 'boolean'
          ? Number(Boolean(is_active))
          : target.is_active;

      if (target.id === req.authUser!.id && nextActive === 0) {
        res.status(400).json({
          ok: false,
          message: 'Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif.',
        });
        return;
      }

      const nextName =
        typeof nama_lengkap === 'string' && nama_lengkap.trim().length >= 2
          ? nama_lengkap.trim()
          : target.nama_lengkap;

      if (typeof password === 'string' && password.length > 0) {
        if (password.length < 6) {
          res.status(400).json({ ok: false, message: 'Kata sandi baru minimal 6 karakter.' });
          return;
        }
        db.prepare(
          'UPDATE users SET nama_lengkap = ?, is_active = ?, password_hash = ? WHERE id = ?'
        ).run(nextName, nextActive, hashPassword(password), targetId);
      } else {
        db.prepare('UPDATE users SET nama_lengkap = ?, is_active = ? WHERE id = ?').run(
          nextName,
          nextActive,
          targetId
        );
      }

      res.json({ ok: true, message: 'Data akun berhasil diperbarui.' });
    }
  );

  // ── PEGAWAI (EMPLOYEES) ─────────────────────────────────────────────────────

  router.get('/pegawai', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const todayWib = getWibDateString();
    const isAdmin = req.authUser!.role === 'admin';

    const sql = `
      SELECT
        p.id,
        p.kode_pegawai,
        p.nama_lengkap,
        p.unit_kerja,
        p.is_active,
        p.created_at,
        p.updated_at,
        pm.id AS penerimaan_id,
        pm.waktu_terima,
        pm.petugas_nama
      FROM pegawai p
      LEFT JOIN penerimaan_makanan pm
        ON pm.pegawai_id = p.id AND pm.tanggal_terima = ? AND pm.status = 'sah'
      ${isAdmin ? '' : 'WHERE p.is_active = 1'}
      ORDER BY p.is_active DESC, (pm.id IS NOT NULL) ASC, p.nama_lengkap ASC
    `;

    const pegawai = db.prepare(sql).all(todayWib) as Pegawai[];
    const units = (
      db
        .prepare('SELECT DISTINCT unit_kerja FROM pegawai ORDER BY unit_kerja ASC')
        .all() as Array<{ unit_kerja: string }>
    ).map((r) => r.unit_kerja);

    res.json({ ok: true, today_wib: todayWib, pegawai, units });
  });

  router.post(
    '/pegawai',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const db = getDb();
      const { nama_lengkap, unit_kerja, kode_pegawai } = req.body ?? {};
      const cleanName = typeof nama_lengkap === 'string' ? nama_lengkap.trim() : '';
      const cleanUnit = typeof unit_kerja === 'string' ? unit_kerja.trim() : '';
      let cleanKode = typeof kode_pegawai === 'string' ? kode_pegawai.trim().toUpperCase() : '';

      if (cleanName.length < 2) {
        res.status(400).json({ ok: false, message: 'Nama lengkap pegawai wajib diisi.' });
        return;
      }
      if (cleanUnit.length < 2) {
        res.status(400).json({ ok: false, message: 'Unit kerja wajib diisi.' });
        return;
      }

      if (!cleanKode) {
        const codes = (
          db.prepare('SELECT kode_pegawai FROM pegawai').all() as Array<{ kode_pegawai: string }>
        ).map((c) => c.kode_pegawai);
        cleanKode = formatNextKodePegawai(codes);
      }

      const duplicateKode = db
        .prepare('SELECT id FROM pegawai WHERE UPPER(kode_pegawai) = ?')
        .get(cleanKode);
      if (duplicateKode) {
        res.status(409).json({
          ok: false,
          message: `Kode pegawai ${cleanKode} sudah terdaftar.`,
        });
        return;
      }

      const now = getWibDateTimeString();
      const tx = db.transaction(() => {
        const info = db
          .prepare(
            'INSERT INTO pegawai (kode_pegawai, nama_lengkap, unit_kerja, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
          )
          .run(cleanKode, cleanName, cleanUnit, now, now);

        const newId = Number(info.lastInsertRowid);
        db.prepare(
          'INSERT INTO audit_log (pegawai_id, aktor_id, aktor_nama, aksi, alasan, data_sebelum, data_sesudah, waktu_wib) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)'
        ).run(
          newId,
          req.authUser!.id,
          req.authUser!.nama_lengkap,
          'TAMBAH_PEGAWAI',
          'Penambahan pegawai baru',
          JSON.stringify({ kode_pegawai: cleanKode, nama_lengkap: cleanName, unit_kerja: cleanUnit }),
          now
        );
        return newId;
      });

      const newId = tx();
      res.status(201).json({
        ok: true,
        message: `Pegawai "${cleanName}" berhasil ditambahkan.`,
        pegawai: {
          id: newId,
          kode_pegawai: cleanKode,
          nama_lengkap: cleanName,
          unit_kerja: cleanUnit,
          is_active: 1,
          created_at: now,
          updated_at: now,
        },
      });
    }
  );

  router.put(
    '/pegawai/:id',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const db = getDb();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ ok: false, message: 'ID pegawai tidak valid.' });
        return;
      }

      const existing = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(id) as
        | Pegawai
        | undefined;
      if (!existing) {
        res.status(404).json({ ok: false, message: 'Pegawai tidak ditemukan.' });
        return;
      }

      const { nama_lengkap, unit_kerja } = req.body ?? {};
      const cleanName = typeof nama_lengkap === 'string' ? nama_lengkap.trim() : '';
      const cleanUnit = typeof unit_kerja === 'string' ? unit_kerja.trim() : '';

      if (cleanName.length < 2 || cleanUnit.length < 2) {
        res.status(400).json({
          ok: false,
          message: 'Nama lengkap dan unit kerja wajib diisi (minimal 2 karakter).',
        });
        return;
      }

      const now = getWibDateTimeString();
      const tx = db.transaction(() => {
        db.prepare(
          'UPDATE pegawai SET nama_lengkap = ?, unit_kerja = ?, updated_at = ? WHERE id = ?'
        ).run(cleanName, cleanUnit, now, id);

        db.prepare(
          'INSERT INTO audit_log (pegawai_id, aktor_id, aktor_nama, aksi, alasan, data_sebelum, data_sesudah, waktu_wib) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          id,
          req.authUser!.id,
          req.authUser!.nama_lengkap,
          'EDIT_PEGAWAI',
          'Pembaruan data pegawai',
          JSON.stringify({
            nama_lengkap: existing.nama_lengkap,
            unit_kerja: existing.unit_kerja,
          }),
          JSON.stringify({ nama_lengkap: cleanName, unit_kerja: cleanUnit }),
          now
        );
      });

      tx();
      res.json({
        ok: true,
        message: `Data pegawai "${cleanName}" berhasil diperbarui tanpa mengubah riwayat penerimaan.`,
      });
    }
  );

  router.patch(
    '/pegawai/:id/status',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const db = getDb();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ ok: false, message: 'ID pegawai tidak valid.' });
        return;
      }

      const existing = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(id) as
        | Pegawai
        | undefined;
      if (!existing) {
        res.status(404).json({ ok: false, message: 'Pegawai tidak ditemukan.' });
        return;
      }

      const nextActive = req.body?.is_active ? 1 : 0;
      const now = getWibDateTimeString();
      const aksi = nextActive === 1 ? 'AKTIF_PEGAWAI' : 'NONAKTIF_PEGAWAI';

      const tx = db.transaction(() => {
        db.prepare('UPDATE pegawai SET is_active = ?, updated_at = ? WHERE id = ?').run(
          nextActive,
          now,
          id
        );
        db.prepare(
          'INSERT INTO audit_log (pegawai_id, aktor_id, aktor_nama, aksi, alasan, data_sebelum, data_sesudah, waktu_wib) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          id,
          req.authUser!.id,
          req.authUser!.nama_lengkap,
          aksi,
          nextActive === 1
            ? 'Pengaktifan kembali penerima MBB'
            : 'Penonaktifan penerima MBB (riwayat tetap tersimpan)',
          JSON.stringify({ is_active: existing.is_active }),
          JSON.stringify({ is_active: nextActive }),
          now
        );
      });

      tx();
      res.json({
        ok: true,
        message:
          nextActive === 1
            ? `Pegawai "${existing.nama_lengkap}" diaktifkan kembali.`
            : `Pegawai "${existing.nama_lengkap}" dinonaktifkan. Riwayat penerimaan sebelumnya tetap tersimpan.`,
      });
    }
  );

  router.post(
    '/pegawai/import',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const db = getDb();
      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(400).json({ ok: false, message: 'Tidak ada baris data pegawai untuk diimpor.' });
        return;
      }

      if (rows.length > 1000) {
        res.status(400).json({ ok: false, message: 'Maksimal 1000 baris per sekali impor.' });
        return;
      }

      const now = getWibDateTimeString();
      const existingRows = db
        .prepare('SELECT kode_pegawai, nama_lengkap, unit_kerja FROM pegawai')
        .all() as Array<{ kode_pegawai: string; nama_lengkap: string; unit_kerja: string }>;

      const existingCodes = new Set(existingRows.map((r) => r.kode_pegawai.toUpperCase()));
      const existingNameUnit = new Set(
        existingRows.map(
          (r) => `${r.nama_lengkap.trim().toLowerCase()}|${r.unit_kerja.trim().toLowerCase()}`
        )
      );
      const allCodesList = existingRows.map((r) => r.kode_pegawai);

      let inserted = 0;
      let skipped = 0;

      const insertStmt = db.prepare(
        'INSERT INTO pegawai (kode_pegawai, nama_lengkap, unit_kerja, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
      );

      const tx = db.transaction(() => {
        for (const raw of rows) {
          const nama = typeof raw?.nama_lengkap === 'string' ? raw.nama_lengkap.trim() : '';
          const unit = typeof raw?.unit_kerja === 'string' ? raw.unit_kerja.trim() : '';
          let kode =
            typeof raw?.kode_pegawai === 'string' ? raw.kode_pegawai.trim().toUpperCase() : '';

          if (nama.length < 2 || unit.length < 2) {
            skipped++;
            continue;
          }

          const nameUnitKey = `${nama.toLowerCase()}|${unit.toLowerCase()}`;
          if ((kode && existingCodes.has(kode)) || existingNameUnit.has(nameUnitKey)) {
            skipped++;
            continue;
          }

          if (!kode) {
            kode = formatNextKodePegawai(allCodesList);
          }

          allCodesList.push(kode);
          existingCodes.add(kode);
          existingNameUnit.add(nameUnitKey);

          insertStmt.run(kode, nama, unit, now, now);
          inserted++;
        }

        if (inserted > 0) {
          db.prepare(
            'INSERT INTO audit_log (aktor_id, aktor_nama, aksi, alasan, data_sesudah, waktu_wib) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(
            req.authUser!.id,
            req.authUser!.nama_lengkap,
            'IMPORT_PEGAWAI',
            `Impor Excel pegawai (${inserted} ditambahkan, ${skipped} dilewati)`,
            JSON.stringify({ inserted, skipped }),
            now
          );
        }
      });

      tx();
      res.json({
        ok: true,
        inserted,
        skipped,
        message: `Impor selesai: ${inserted} pegawai baru ditambahkan, ${skipped} baris duplikat/tidak valid dilewati.`,
      });
    }
  );

  // ── PENERIMAAN MAKANAN ──────────────────────────────────────────────────────

  router.post('/penerimaan', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const pegawaiId = Number(req.body?.pegawai_id);
    if (!Number.isInteger(pegawaiId) || pegawaiId <= 0) {
      res.status(400).json({ ok: false, message: 'ID pegawai tidak valid.' });
      return;
    }

    const todayWib = getWibDateString();
    const nowWib = getWibDateTimeString();
    const jamWib = `${nowWib.split(' ')[1]} WIB`;

    const tx = db.transaction(() => {
      const emp = db
        .prepare('SELECT id, kode_pegawai, nama_lengkap, unit_kerja, is_active FROM pegawai WHERE id = ?')
        .get(pegawaiId) as Pegawai | undefined;

      if (!emp) {
        return { kind: 'not_found' as const };
      }
      if (emp.is_active !== 1) {
        return { kind: 'inactive' as const, emp };
      }

      const existing = db
        .prepare(
          "SELECT id, waktu_terima, petugas_nama FROM penerimaan_makanan WHERE pegawai_id = ? AND tanggal_terima = ? AND status = 'sah'"
        )
        .get(pegawaiId, todayWib) as
        | { id: number; waktu_terima: string; petugas_nama: string }
        | undefined;

      if (existing) {
        return { kind: 'duplicate' as const, emp, existing };
      }

      const info = db
        .prepare(
          "INSERT INTO penerimaan_makanan (pegawai_id, tanggal_terima, waktu_terima, petugas_id, petugas_nama, status, created_at) VALUES (?, ?, ?, ?, ?, 'sah', ?)"
        )
        .run(pegawaiId, todayWib, nowWib, req.authUser!.id, req.authUser!.nama_lengkap, nowWib);

      const newId = Number(info.lastInsertRowid);
      db.prepare(
        'INSERT INTO audit_log (penerimaan_id, pegawai_id, aktor_id, aktor_nama, aksi, alasan, data_sesudah, waktu_wib) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        newId,
        pegawaiId,
        req.authUser!.id,
        req.authUser!.nama_lengkap,
        'CATAT',
        'Penyerahan makanan MBB',
        JSON.stringify({
          pegawai: emp.nama_lengkap,
          tanggal_terima: todayWib,
          waktu_terima: nowWib,
        }),
        nowWib
      );

      return { kind: 'created' as const, id: newId, emp };
    });

    try {
      const result = tx.immediate();
      if (result.kind === 'not_found') {
        res.status(404).json({ ok: false, message: 'Data pegawai tidak ditemukan.' });
        return;
      }
      if (result.kind === 'inactive') {
        res.status(400).json({
          ok: false,
          message: `Pegawai "${result.emp.nama_lengkap}" berstatus nonaktif dan tidak dapat menerima makanan.`,
        });
        return;
      }
      if (result.kind === 'duplicate') {
        const prevJam = result.existing.waktu_terima.split(' ')[1] ?? result.existing.waktu_terima;
        res.status(409).json({
          ok: false,
          message: `${result.emp.nama_lengkap} sudah tercatat menerima makanan hari ini pukul ${prevJam} WIB (dicatat oleh ${result.existing.petugas_nama}).`,
        });
        return;
      }

      res.status(201).json({
        ok: true,
        id: result.id,
        tanggal_wib: todayWib,
        waktu_terima: nowWib,
        jam_wib: jamWib,
        petugas: req.authUser!.nama_lengkap,
        message: `Penerimaan makanan untuk ${result.emp.nama_lengkap} berhasil dicatat.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE constraint failed')) {
        res.status(409).json({
          ok: false,
          message: 'Penerimaan ganda dicegah: pegawai sudah tercatat menerima makanan hari ini.',
        });
        return;
      }
      res.status(500).json({ ok: false, message: 'Gagal menyimpan catatan penerimaan.' });
    }
  });

  // ── DASHBOARD ───────────────────────────────────────────────────────────────

  router.get('/dashboard', requireAuth, (_req, res: Response) => {
    const db = getDb();
    const todayWib = getWibDateString();
    const sevenDaysAgo = addDaysWib(todayWib, -6);

    const activeEmployees = db
      .prepare(
        `SELECT p.id, p.unit_kerja, pm.id AS penerimaan_id
         FROM pegawai p
         LEFT JOIN penerimaan_makanan pm
           ON pm.pegawai_id = p.id AND pm.tanggal_terima = ? AND pm.status = 'sah'
         WHERE p.is_active = 1`
      )
      .all(todayWib) as Array<{ id: number; unit_kerja: string; penerimaan_id: number | null }>;

    const total_aktif = activeEmployees.length;
    const sudah_terima = activeEmployees.filter((e) => e.penerimaan_id !== null).length;
    const belum_terima = total_aktif - sudah_terima;
    const persentase = total_aktif > 0 ? Math.round((sudah_terima / total_aktif) * 100) : 0;

    const unitMap = new Map<string, { total: number; sudah: number }>();
    for (const emp of activeEmployees) {
      const cur = unitMap.get(emp.unit_kerja) ?? { total: 0, sudah: 0 };
      cur.total += 1;
      if (emp.penerimaan_id !== null) cur.sudah += 1;
      unitMap.set(emp.unit_kerja, cur);
    }

    const per_unit = Array.from(unitMap.entries())
      .map(([unit_kerja, v]) => ({
        unit_kerja,
        total_pegawai: v.total,
        sudah_terima: v.sudah,
        belum_terima: v.total - v.sudah,
        persentase: v.total > 0 ? Math.round((v.sudah / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.unit_kerja.localeCompare(b.unit_kerja, 'id'));

    const recent_penerimaan = db
      .prepare(
        `SELECT pm.*, p.kode_pegawai, p.nama_lengkap, p.unit_kerja
         FROM penerimaan_makanan pm
         JOIN pegawai p ON p.id = pm.pegawai_id
         WHERE pm.tanggal_terima = ?
         ORDER BY pm.waktu_terima DESC
         LIMIT 12`
      )
      .all(todayWib) as PenerimaanRecord[];

    const trenRows = db
      .prepare(
        `SELECT tanggal_terima AS tanggal, COUNT(*) AS total_sah
         FROM penerimaan_makanan
         WHERE tanggal_terima BETWEEN ? AND ? AND status = 'sah'
         GROUP BY tanggal_terima
         ORDER BY tanggal_terima ASC`
      )
      .all(sevenDaysAgo, todayWib) as Array<{ tanggal: string; total_sah: number }>;

    const trenMap = new Map(trenRows.map((r) => [r.tanggal, r.total_sah]));
    const tren_harian: Array<{ tanggal: string; total_sah: number }> = [];
    for (let i = -6; i <= 0; i++) {
      const t = addDaysWib(todayWib, i);
      tren_harian.push({ tanggal: t, total_sah: trenMap.get(t) ?? 0 });
    }

    res.json({
      ok: true,
      dashboard: {
        tanggal_wib: todayWib,
        total_aktif,
        sudah_terima,
        belum_terima,
        persentase,
        per_unit,
        recent_penerimaan,
        tren_harian,
      },
    });
  });

  // ── RIWAYAT & KOREKSI ADMIN ─────────────────────────────────────────────────

  router.get('/penerimaan/riwayat', requireAuth, (req, res: Response) => {
    const db = getDb();
    const todayWib = getWibDateString();
    const startDate =
      typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
        ? req.query.startDate
        : addDaysWib(todayWib, -30);
    const endDate =
      typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
        ? req.query.endDate
        : todayWib;
    const unit = typeof req.query.unit === 'string' ? req.query.unit.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    const clauses: string[] = ['pm.tanggal_terima BETWEEN ? AND ?'];
    const params: unknown[] = [startDate, endDate];

    if (unit) {
      clauses.push('p.unit_kerja = ?');
      params.push(unit);
    }
    if (status && ['sah', 'dibatalkan', 'dikoreksi'].includes(status)) {
      clauses.push('pm.status = ?');
      params.push(status);
    }
    if (search) {
      clauses.push('(LOWER(p.nama_lengkap) LIKE ? OR LOWER(p.kode_pegawai) LIKE ? OR LOWER(pm.petugas_nama) LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const records = db
      .prepare(
        `SELECT pm.*, p.kode_pegawai, p.nama_lengkap, p.unit_kerja
         FROM penerimaan_makanan pm
         JOIN pegawai p ON p.id = pm.pegawai_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY pm.waktu_terima DESC
         LIMIT 500`
      )
      .all(...params) as PenerimaanRecord[];

    res.json({ ok: true, records, startDate, endDate });
  });

  router.get('/audit-log', requireAuth, (_req, res: Response) => {
    const db = getDb();
    const logs = db
      .prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200')
      .all();
    res.json({ ok: true, logs });
  });

  router.post(
    '/penerimaan/:id/koreksi',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const db = getDb();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ ok: false, message: 'ID penerimaan tidak valid.' });
        return;
      }

      const { status, alasan_koreksi, catatan } = req.body ?? {};
      const nextStatus = status === 'dibatalkan' || status === 'dikoreksi' ? status : '';
      const cleanReason = typeof alasan_koreksi === 'string' ? alasan_koreksi.trim() : '';
      const cleanNote = typeof catatan === 'string' ? catatan.trim() : null;

      if (!nextStatus) {
        res.status(400).json({
          ok: false,
          message: 'Jenis tindakan koreksi harus dipilih (dibatalkan atau dikoreksi).',
        });
        return;
      }
      if (cleanReason.length < 5) {
        res.status(400).json({
          ok: false,
          message: 'Alasan koreksi wajib diisi minimal 5 karakter sebagai rekam jejak.',
        });
        return;
      }

      const nowWib = getWibDateTimeString();

      const tx = db.transaction(() => {
        const existing = db
          .prepare(
            `SELECT pm.*, p.nama_lengkap, p.kode_pegawai
             FROM penerimaan_makanan pm
             JOIN pegawai p ON p.id = pm.pegawai_id
             WHERE pm.id = ?`
          )
          .get(id) as (PenerimaanRecord & { nama_lengkap: string; kode_pegawai: string }) | undefined;

        if (!existing) {
          return { kind: 'not_found' as const };
        }
        if (existing.status === 'dibatalkan') {
          return { kind: 'already_cancelled' as const };
        }

        db.prepare(
          `UPDATE penerimaan_makanan
           SET status = ?, catatan = COALESCE(?, catatan), dikoreksi_oleh = ?, dikoreksi_oleh_nama = ?, alasan_koreksi = ?, waktu_koreksi = ?
           WHERE id = ?`
        ).run(
          nextStatus,
          cleanNote,
          req.authUser!.id,
          req.authUser!.nama_lengkap,
          cleanReason,
          nowWib,
          id
        );

        db.prepare(
          `INSERT INTO audit_log
           (penerimaan_id, pegawai_id, aktor_id, aktor_nama, aksi, alasan, data_sebelum, data_sesudah, waktu_wib)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          existing.pegawai_id,
          req.authUser!.id,
          req.authUser!.nama_lengkap,
          nextStatus === 'dibatalkan' ? 'BATALKAN' : 'KOREKSI',
          cleanReason,
          JSON.stringify({
            status: existing.status,
            waktu_terima: existing.waktu_terima,
            petugas_nama: existing.petugas_nama,
            pegawai: existing.nama_lengkap,
          }),
          JSON.stringify({
            status: nextStatus,
            alasan_koreksi: cleanReason,
            waktu_koreksi: nowWib,
            dikoreksi_oleh: req.authUser!.nama_lengkap,
          }),
          nowWib
        );

        return { kind: 'updated' as const, existing };
      });

      const result = tx();
      if (result.kind === 'not_found') {
        res.status(404).json({ ok: false, message: 'Catatan penerimaan tidak ditemukan.' });
        return;
      }
      if (result.kind === 'already_cancelled') {
        res.status(400).json({ ok: false, message: 'Catatan penerimaan ini sudah dibatalkan sebelumnya.' });
        return;
      }

      res.json({
        ok: true,
        message:
          nextStatus === 'dibatalkan'
            ? `Penerimaan atas nama ${result.existing.nama_lengkap} berhasil dibatalkan dan tercatat pada rekam jejak.`
            : `Penerimaan atas nama ${result.existing.nama_lengkap} berhasil dikoreksi dan tercatat pada rekam jejak.`,
      });
    }
  );

  // ── REKAPITULASI & EKSPOR EXCEL ─────────────────────────────────────────────

  function buildRecap(startDate: string, endDate: string, unit: string) {
    const db = getDb();
    const empClause = unit ? 'WHERE p.unit_kerja = ?' : '';
    const empParams = unit ? [startDate, endDate, unit] : [startDate, endDate];

    const per_pegawai = db
      .prepare(
        `SELECT
           p.id AS pegawai_id,
           p.kode_pegawai,
           p.nama_lengkap,
           p.unit_kerja,
           p.is_active,
           SUM(CASE WHEN pm.status = 'sah' THEN 1 ELSE 0 END) AS jumlah_sah,
           SUM(CASE WHEN pm.status = 'dibatalkan' THEN 1 ELSE 0 END) AS jumlah_dibatalkan,
           MAX(CASE WHEN pm.status = 'sah' THEN pm.waktu_terima ELSE NULL END) AS terakhir_terima
         FROM pegawai p
         LEFT JOIN penerimaan_makanan pm
           ON pm.pegawai_id = p.id AND pm.tanggal_terima BETWEEN ? AND ?
         ${empClause}
         GROUP BY p.id
         ORDER BY p.is_active DESC, p.unit_kerja ASC, p.nama_lengkap ASC`
      )
      .all(...empParams) as Array<{
      pegawai_id: number;
      kode_pegawai: string;
      nama_lengkap: string;
      unit_kerja: string;
      is_active: number;
      jumlah_sah: number;
      jumlah_dibatalkan: number;
      terakhir_terima: string | null;
    }>;

    const unitMap = new Map<
      string,
      { jumlah_pegawai: number; total_sah: number; total_dibatalkan: number }
    >();
    let total_sah = 0;
    let total_dibatalkan = 0;

    for (const row of per_pegawai) {
      const sah = Number(row.jumlah_sah ?? 0);
      const batal = Number(row.jumlah_dibatalkan ?? 0);
      total_sah += sah;
      total_dibatalkan += batal;

      const cur = unitMap.get(row.unit_kerja) ?? {
        jumlah_pegawai: 0,
        total_sah: 0,
        total_dibatalkan: 0,
      };
      cur.jumlah_pegawai += 1;
      cur.total_sah += sah;
      cur.total_dibatalkan += batal;
      unitMap.set(row.unit_kerja, cur);
    }

    const per_unit = Array.from(unitMap.entries())
      .map(([unit_kerja, v]) => ({ unit_kerja, ...v }))
      .sort((a, b) => a.unit_kerja.localeCompare(b.unit_kerja, 'id'));

    return {
      startDate,
      endDate,
      total_pegawai: per_pegawai.length,
      total_sah,
      total_dibatalkan,
      per_unit,
      per_pegawai,
    };
  }

  router.get('/rekapitulasi', requireAuth, (req, res: Response) => {
    const todayWib = getWibDateString();
    const firstOfMonth = `${todayWib.slice(0, 7)}-01`;
    const startDate =
      typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
        ? req.query.startDate
        : firstOfMonth;
    const endDate =
      typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
        ? req.query.endDate
        : todayWib;
    const unit = typeof req.query.unit === 'string' ? req.query.unit.trim() : '';

    const recap = buildRecap(startDate, endDate, unit);
    res.json({ ok: true, recap });
  });

  router.get('/rekapitulasi/export', requireAuth, async (req, res: Response) => {
    const db = getDb();
    const todayWib = getWibDateString();
    const firstOfMonth = `${todayWib.slice(0, 7)}-01`;
    const startDate =
      typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
        ? req.query.startDate
        : firstOfMonth;
    const endDate =
      typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
        ? req.query.endDate
        : todayWib;
    const unit = typeof req.query.unit === 'string' ? req.query.unit.trim() : '';

    const recap = buildRecap(startDate, endDate, unit);

    const detailClauses = ['pm.tanggal_terima BETWEEN ? AND ?'];
    const detailParams: unknown[] = [startDate, endDate];
    if (unit) {
      detailClauses.push('p.unit_kerja = ?');
      detailParams.push(unit);
    }

    const details = db
      .prepare(
        `SELECT pm.tanggal_terima, pm.waktu_terima, p.kode_pegawai, p.nama_lengkap, p.unit_kerja,
                pm.petugas_nama, pm.status, pm.alasan_koreksi, pm.dikoreksi_oleh_nama
         FROM penerimaan_makanan pm
         JOIN pegawai p ON p.id = pm.pegawai_id
         WHERE ${detailClauses.join(' AND ')}
         ORDER BY pm.waktu_terima DESC`
      )
      .all(...detailParams) as Array<{
      tanggal_terima: string;
      waktu_terima: string;
      kode_pegawai: string;
      nama_lengkap: string;
      unit_kerja: string;
      petugas_nama: string;
      status: string;
      alasan_koreksi: string | null;
      dikoreksi_oleh_nama: string | null;
    }>;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Absen MBB PTA Kep. Bangka Belitung';

    const styleHeader = (sheet: ExcelJS.Worksheet) => {
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF065F46' },
      };
    };

    const wsPegawai = wb.addWorksheet('Rekap per Pegawai');
    wsPegawai.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Kode Pegawai', key: 'kode', width: 15 },
      { header: 'Nama Lengkap', key: 'nama', width: 32 },
      { header: 'Unit Kerja', key: 'unit', width: 30 },
      { header: 'Status Pegawai', key: 'status', width: 15 },
      { header: 'Penerimaan Sah', key: 'sah', width: 16 },
      { header: 'Dibatalkan', key: 'batal', width: 14 },
      { header: 'Terakhir Terima (WIB)', key: 'terakhir', width: 22 },
    ];
    recap.per_pegawai.forEach((r, i) => {
      wsPegawai.addRow({
        no: i + 1,
        kode: r.kode_pegawai,
        nama: r.nama_lengkap,
        unit: r.unit_kerja,
        status: r.is_active === 1 ? 'Aktif' : 'Nonaktif',
        sah: r.jumlah_sah,
        batal: r.jumlah_dibatalkan,
        terakhir: r.terakhir_terima ?? '-',
      });
    });
    styleHeader(wsPegawai);

    const wsUnit = wb.addWorksheet('Rekap per Unit');
    wsUnit.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Unit Kerja', key: 'unit', width: 34 },
      { header: 'Jumlah Pegawai', key: 'pegawai', width: 16 },
      { header: 'Total Penerimaan Sah', key: 'sah', width: 20 },
      { header: 'Total Dibatalkan', key: 'batal', width: 16 },
    ];
    recap.per_unit.forEach((u, i) => {
      wsUnit.addRow({
        no: i + 1,
        unit: u.unit_kerja,
        pegawai: u.jumlah_pegawai,
        sah: u.total_sah,
        batal: u.total_dibatalkan,
      });
    });
    styleHeader(wsUnit);

    const wsDetail = wb.addWorksheet('Detail Transaksi');
    wsDetail.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Tanggal (WIB)', key: 'tgl', width: 14 },
      { header: 'Waktu Terima (WIB)', key: 'waktu', width: 22 },
      { header: 'Kode Pegawai', key: 'kode', width: 14 },
      { header: 'Nama Lengkap', key: 'nama', width: 30 },
      { header: 'Unit Kerja', key: 'unit', width: 28 },
      { header: 'Petugas Pencatat', key: 'petugas', width: 24 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Alasan Koreksi', key: 'alasan', width: 30 },
      { header: 'Dikoreksi Oleh', key: 'korektor', width: 22 },
    ];
    details.forEach((d, i) => {
      wsDetail.addRow({
        no: i + 1,
        tgl: d.tanggal_terima,
        waktu: d.waktu_terima,
        kode: d.kode_pegawai,
        nama: d.nama_lengkap,
        unit: d.unit_kerja,
        petugas: d.petugas_nama,
        status: d.status.toUpperCase(),
        alasan: d.alasan_koreksi ?? '-',
        korektor: d.dikoreksi_oleh_nama ?? '-',
      });
    });
    styleHeader(wsDetail);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const filename = `Rekap_MBB_PTA_Babel_${startDate}_sd_${endDate}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });

  return router;
}
