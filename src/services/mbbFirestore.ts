import ExcelJS from 'exceljs';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AuditLogEntry,
  AuthUser,
  DashboardData,
  EmployeeRecapRow,
  Pegawai,
  PenerimaanRecord,
  PenerimaanStatus,
  RecapData,
  StaffInvite,
  UserRole,
} from '../types';
import { formatNextKodePegawai } from '../utils/mbbLogic';
import { addDaysWib, getWibDateString, getWibDateTimeString } from '../utils/wib';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'ptababel@gmail.com';

export class AppDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppDomainError';
  }
}

export function getFriendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AppDomainError) return err.message;
  if (err instanceof Error) {
    // Check if handleFirestoreError serialized JSON
    if (err.message.startsWith('{') && err.message.includes('"operationType"')) {
      try {
        const parsed = JSON.parse(err.message) as { error?: string };
        if (parsed.error?.includes('Quota exceeded')) {
          return 'Kuota harian Firestore tercapai. Silakan coba kembali besok atau tingkatkan paket proyek Firebase.';
        }
        if (parsed.error?.includes('Missing or insufficient permissions')) {
          return 'Akses ditolak oleh aturan keamanan Firestore. Pastikan akun Anda aktif dan memiliki peran yang sesuai.';
        }
      } catch {
        // ignore JSON parse failure
      }
      return fallback;
    }
    return err.message || fallback;
  }
  return fallback;
}

function makeSafeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

async function emailToInviteId(email: string): Promise<string> {
  const clean = email.trim().toLowerCase();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(clean);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 40);
    return `inv_${hex}`;
  }
  return `inv_${clean.replace(/[^a-z0-9]/g, '_').slice(0, 80)}`;
}

function clampString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function sanitizeKodePegawai(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32);
}

const INITIAL_PEGAWAI_SEED: Array<[string, string, string]> = [
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

async function seedInitialPegawaiIfEmpty(adminUid: string): Promise<void> {
  const path = 'pegawai';
  try {
    const existingSnap = await getDocs(query(collection(db, path), limit(1)));
    if (!existingSnap.empty) return;

    const nowWib = getWibDateTimeString();
    const batch = writeBatch(db);
    for (const [kode, nama, unit] of INITIAL_PEGAWAI_SEED) {
      const docId = `emp_${kode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      batch.set(doc(db, path, docId), {
        kode_pegawai: kode,
        nama_lengkap: nama,
        unit_kerja: unit,
        is_active: 1,
        created_by: adminUid,
        created_at_wib: nowWib,
        updated_at_wib: nowWib,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export type ResolveAuthResult =
  | { status: 'ok'; user: AuthUser }
  | { status: 'inactive' }
  | { status: 'unverified' }
  | { status: 'unregistered'; email: string };

export async function resolveSignedInUser(fbUser: FirebaseUser): Promise<ResolveAuthResult> {
  if (!fbUser.emailVerified || !fbUser.email) {
    return { status: 'unverified' };
  }

  const email = fbUser.email.trim().toLowerCase();
  const uid = fbUser.uid;
  const userPath = `users/${uid}`;
  const isBootAdmin = email === BOOTSTRAPPED_ADMIN_EMAIL;

  let existingUserData: Record<string, unknown> | null = null;
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      existingUserData = userSnap.data() as Record<string, unknown>;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  if (existingUserData) {
    const isActive = Number(existingUserData.is_active ?? 1);
    if (isActive !== 1 && !isBootAdmin) {
      return { status: 'inactive' };
    }

    const role: UserRole =
      isBootAdmin || existingUserData.role === 'admin' ? 'admin' : 'petugas';
    const nama =
      typeof existingUserData.nama_lengkap === 'string' && existingUserData.nama_lengkap.trim()
        ? existingUserData.nama_lengkap.trim()
        : clampString(fbUser.displayName || email.split('@')[0] || 'Pengguna MBB', 120);

    // Sync private email doc & admin grant if needed
    try {
      await setDoc(
        doc(db, 'users', uid, 'private', 'info'),
        {
          uid,
          email,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
    }

    if (role === 'admin') {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', uid));
        if (!adminSnap.exists()) {
          await setDoc(doc(db, 'admins', uid), {
            uid,
            is_active: 1,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `admins/${uid}`);
      }
      await seedInitialPegawaiIfEmpty(uid);
    }

    return {
      status: 'ok',
      user: {
        id: uid,
        username: email,
        email,
        nama_lengkap: nama,
        role,
        is_active: 1,
      },
    };
  }

  // User doc does not exist yet
  if (isBootAdmin) {
    const nama = clampString(fbUser.displayName || 'Administrator PTA Kep. Babel', 120);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), {
        uid,
        nama_lengkap: nama,
        role: 'admin',
        is_active: 1,
        inviteId: 'bootstrap',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', uid, 'private', 'info'), {
        uid,
        email,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'admins', uid), {
        uid,
        is_active: 1,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, userPath);
    }

    await seedInitialPegawaiIfEmpty(uid);

    return {
      status: 'ok',
      user: {
        id: uid,
        username: email,
        email,
        nama_lengkap: nama,
        role: 'admin',
        is_active: 1,
      },
    };
  }

  // Look up active invite by verified email
  let inviteSnapDoc: { id: string; data: Record<string, unknown> } | null = null;
  try {
    const inviteQuery = query(collection(db, 'staff_invites'), where('email', '==', email));
    const snap = await getDocs(inviteQuery);
    const activeDoc = snap.docs.find((d) => Number(d.data().is_active ?? 0) === 1);
    if (activeDoc) {
      inviteSnapDoc = { id: activeDoc.id, data: activeDoc.data() as Record<string, unknown> };
    } else if (!snap.empty) {
      return { status: 'inactive' };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'staff_invites');
  }

  if (!inviteSnapDoc) {
    return { status: 'unregistered', email };
  }

  const invitedRole: UserRole = inviteSnapDoc.data.role === 'admin' ? 'admin' : 'petugas';
  const invitedName = clampString(
    typeof inviteSnapDoc.data.nama_lengkap === 'string' && inviteSnapDoc.data.nama_lengkap.trim()
      ? inviteSnapDoc.data.nama_lengkap
      : fbUser.displayName || email.split('@')[0] || 'Petugas MBB',
    120
  );

  try {
    await setDoc(doc(db, 'users', uid), {
      uid,
      nama_lengkap: invitedName,
      role: invitedRole,
      is_active: 1,
      inviteId: inviteSnapDoc.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users', uid, 'private', 'info'), {
      uid,
      email,
      updatedAt: serverTimestamp(),
    });
    if (invitedRole === 'admin') {
      await setDoc(doc(db, 'admins', uid), {
        uid,
        is_active: 1,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  if (invitedRole === 'admin') {
    await seedInitialPegawaiIfEmpty(uid);
  }

  return {
    status: 'ok',
    user: {
      id: uid,
      username: email,
      email,
      nama_lengkap: invitedName,
      role: invitedRole,
      is_active: 1,
    },
  };
}

// ── PEGAWAI & REAL-TIME SUBSCRIPTION ─────────────────────────────────────────

function mapPegawaiDocs(
  pegawaiDocs: Array<{ id: string; data: Record<string, unknown> }>,
  receiptByPegawai: Map<string, { id: string; waktu_terima: string; petugas_nama: string }>
): { pegawai: Pegawai[]; units: string[] } {
  const unitSet = new Set<string>();
  const list: Pegawai[] = pegawaiDocs.map(({ id, data }) => {
    const unit = String(data.unit_kerja ?? '');
    if (unit) unitSet.add(unit);
    const receipt = receiptByPegawai.get(id);
    return {
      id,
      kode_pegawai: String(data.kode_pegawai ?? ''),
      nama_lengkap: String(data.nama_lengkap ?? ''),
      unit_kerja: unit,
      is_active: Number(data.is_active ?? 1),
      created_at: String(data.created_at_wib ?? ''),
      updated_at: String(data.updated_at_wib ?? ''),
      penerimaan_id: receipt ? receipt.id : null,
      waktu_terima: receipt ? receipt.waktu_terima : null,
      petugas_nama: receipt ? receipt.petugas_nama : null,
    };
  });

  list.sort((a, b) => {
    if (a.is_active !== b.is_active) return b.is_active - a.is_active;
    const aRec = a.penerimaan_id ? 1 : 0;
    const bRec = b.penerimaan_id ? 1 : 0;
    if (aRec !== bRec) return aRec - bRec;
    return a.nama_lengkap.localeCompare(b.nama_lengkap, 'id');
  });

  const units = Array.from(unitSet).sort((a, b) => a.localeCompare(b, 'id'));
  return { pegawai: list, units };
}

export async function fetchPegawaiWithToday(role: UserRole): Promise<{
  today_wib: string;
  pegawai: Pegawai[];
  units: string[];
}> {
  const todayWib = getWibDateString();
  const pegawaiQuery =
    role === 'admin'
      ? collection(db, 'pegawai')
      : query(collection(db, 'pegawai'), where('is_active', '==', 1));

  let pegawaiDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
  try {
    const snap = await getDocs(pegawaiQuery);
    pegawaiDocs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'pegawai');
  }

  const receiptByPegawai = new Map<
    string,
    { id: string; waktu_terima: string; petugas_nama: string }
  >();
  try {
    const recSnap = await getDocs(
      query(collection(db, 'penerimaan_makanan'), where('tanggal_terima', '==', todayWib))
    );
    for (const d of recSnap.docs) {
      const data = d.data();
      if (data.status === 'sah') {
        receiptByPegawai.set(String(data.pegawai_id), {
          id: d.id,
          waktu_terima: String(data.waktu_terima ?? ''),
          petugas_nama: String(data.petugas_nama ?? ''),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'penerimaan_makanan');
  }

  return {
    today_wib: todayWib,
    ...mapPegawaiDocs(pegawaiDocs, receiptByPegawai),
  };
}

export function subscribePegawaiWithToday(
  role: UserRole,
  onUpdate: (payload: { today_wib: string; pegawai: Pegawai[]; units: string[] }) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const todayWib = getWibDateString();
  const pegawaiQuery =
    role === 'admin'
      ? collection(db, 'pegawai')
      : query(collection(db, 'pegawai'), where('is_active', '==', 1));
  const receiptQuery = query(
    collection(db, 'penerimaan_makanan'),
    where('tanggal_terima', '==', todayWib)
  );

  let latestPegawai: Array<{ id: string; data: Record<string, unknown> }> = [];
  let latestReceipts = new Map<
    string,
    { id: string; waktu_terima: string; petugas_nama: string }
  >();
  let gotPegawai = false;
  let gotReceipts = false;

  const emitIfReady = () => {
    if (gotPegawai && gotReceipts) {
      onUpdate({
        today_wib: getWibDateString(),
        ...mapPegawaiDocs(latestPegawai, latestReceipts),
      });
    }
  };

  const unsubPegawai = onSnapshot(
    pegawaiQuery,
    (snap) => {
      latestPegawai = snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
      gotPegawai = true;
      emitIfReady();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'pegawai');
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );

  const unsubReceipts = onSnapshot(
    receiptQuery,
    (snap) => {
      const next = new Map<string, { id: string; waktu_terima: string; petugas_nama: string }>();
      for (const d of snap.docs) {
        const data = d.data();
        if (data.status === 'sah') {
          next.set(String(data.pegawai_id), {
            id: d.id,
            waktu_terima: String(data.waktu_terima ?? ''),
            petugas_nama: String(data.petugas_nama ?? ''),
          });
        }
      }
      latestReceipts = next;
      gotReceipts = true;
      emitIfReady();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'penerimaan_makanan');
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );

  return () => {
    unsubPegawai();
    unsubReceipts();
  };
}

export async function createPegawai(
  input: { nama_lengkap: string; unit_kerja: string; kode_pegawai?: string },
  actor: AuthUser
): Promise<string> {
  const cleanName = clampString(input.nama_lengkap, 120);
  const cleanUnit = clampString(input.unit_kerja, 100);
  if (cleanName.length < 2) {
    throw new AppDomainError('Nama lengkap pegawai minimal 2 karakter.');
  }
  if (cleanUnit.length < 2) {
    throw new AppDomainError('Unit kerja wajib diisi minimal 2 karakter.');
  }

  let existingCodes: string[] = [];
  try {
    const snap = await getDocs(collection(db, 'pegawai'));
    existingCodes = snap.docs.map((d) => String(d.data().kode_pegawai ?? '').toUpperCase());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'pegawai');
  }

  let cleanKode = input.kode_pegawai ? sanitizeKodePegawai(input.kode_pegawai) : '';
  if (!cleanKode) {
    cleanKode = formatNextKodePegawai(existingCodes);
  }
  if (cleanKode.length < 2) {
    throw new AppDomainError('Kode pegawai minimal 2 karakter huruf/angka.');
  }
  if (existingCodes.includes(cleanKode.toUpperCase())) {
    throw new AppDomainError(`Kode pegawai ${cleanKode} sudah terdaftar.`);
  }

  const nowWib = getWibDateTimeString();
  const newId = makeSafeId('peg');
  const logId = makeSafeId('log');

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'pegawai', newId), {
      kode_pegawai: cleanKode,
      nama_lengkap: cleanName,
      unit_kerja: cleanUnit,
      is_active: 1,
      created_by: actor.id,
      created_at_wib: nowWib,
      updated_at_wib: nowWib,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'audit_log', logId), {
      penerimaan_id: null,
      pegawai_id: newId,
      aktor_id: actor.id,
      aktor_nama: clampString(actor.nama_lengkap, 120),
      aksi: 'TAMBAH_PEGAWAI',
      alasan: 'Penambahan pegawai baru',
      data_sebelum: null,
      data_sesudah: {
        kode_pegawai: cleanKode,
        nama_lengkap: cleanName,
        unit_kerja: cleanUnit,
      },
      waktu_wib: nowWib,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `pegawai/${newId}`);
  }

  return `Pegawai "${cleanName}" berhasil ditambahkan dan tersimpan ke Firebase.`;
}

export async function updatePegawai(
  emp: Pegawai,
  input: { nama_lengkap: string; unit_kerja: string },
  actor: AuthUser
): Promise<string> {
  const cleanName = clampString(input.nama_lengkap, 120);
  const cleanUnit = clampString(input.unit_kerja, 100);
  if (cleanName.length < 2 || cleanUnit.length < 2) {
    throw new AppDomainError('Nama lengkap dan unit kerja wajib diisi (minimal 2 karakter).');
  }

  const nowWib = getWibDateTimeString();
  const logId = makeSafeId('log');

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'pegawai', emp.id), {
      nama_lengkap: cleanName,
      unit_kerja: cleanUnit,
      updated_at_wib: nowWib,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'audit_log', logId), {
      penerimaan_id: null,
      pegawai_id: emp.id,
      aktor_id: actor.id,
      aktor_nama: clampString(actor.nama_lengkap, 120),
      aksi: 'EDIT_PEGAWAI',
      alasan: 'Pembaruan data pegawai',
      data_sebelum: {
        nama_lengkap: emp.nama_lengkap,
        unit_kerja: emp.unit_kerja,
      },
      data_sesudah: {
        nama_lengkap: cleanName,
        unit_kerja: cleanUnit,
      },
      waktu_wib: nowWib,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `pegawai/${emp.id}`);
  }

  return `Data pegawai "${cleanName}" berhasil diperbarui permanen di Firebase tanpa mengubah riwayat.`;
}

export async function togglePegawaiStatus(
  emp: Pegawai,
  nextActive: 0 | 1,
  actor: AuthUser
): Promise<string> {
  const nowWib = getWibDateTimeString();
  const logId = makeSafeId('log');
  const aksi = nextActive === 1 ? 'AKTIF_PEGAWAI' : 'NONAKTIF_PEGAWAI';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'pegawai', emp.id), {
      is_active: nextActive,
      updated_at_wib: nowWib,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'audit_log', logId), {
      penerimaan_id: null,
      pegawai_id: emp.id,
      aktor_id: actor.id,
      aktor_nama: clampString(actor.nama_lengkap, 120),
      aksi,
      alasan:
        nextActive === 1
          ? 'Pengaktifan kembali penerima MBB'
          : 'Penonaktifan penerima MBB (riwayat tetap tersimpan)',
      data_sebelum: { is_active: emp.is_active },
      data_sesudah: { is_active: nextActive },
      waktu_wib: nowWib,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `pegawai/${emp.id}`);
  }

  return nextActive === 1
    ? `Pegawai "${emp.nama_lengkap}" diaktifkan kembali.`
    : `Pegawai "${emp.nama_lengkap}" dinonaktifkan. Riwayat penerimaan sebelumnya tetap tersimpan.`;
}

export async function importPegawaiRows(
  rows: Array<{ kode_pegawai?: string; nama_lengkap: string; unit_kerja: string }>,
  actor: AuthUser
): Promise<{ inserted: number; skipped: number; message: string }> {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppDomainError('Tidak ada baris data pegawai untuk diimpor.');
  }
  if (rows.length > 1000) {
    throw new AppDomainError('Maksimal 1000 baris per sekali impor.');
  }

  let existingRows: Array<{ kode_pegawai: string; nama_lengkap: string; unit_kerja: string }> = [];
  try {
    const snap = await getDocs(collection(db, 'pegawai'));
    existingRows = snap.docs.map((d) => ({
      kode_pegawai: String(d.data().kode_pegawai ?? ''),
      nama_lengkap: String(d.data().nama_lengkap ?? ''),
      unit_kerja: String(d.data().unit_kerja ?? ''),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'pegawai');
  }

  const existingCodes = new Set(existingRows.map((r) => r.kode_pegawai.toUpperCase()));
  const existingNameUnit = new Set(
    existingRows.map(
      (r) => `${r.nama_lengkap.trim().toLowerCase()}|${r.unit_kerja.trim().toLowerCase()}`
    )
  );
  const allCodesList = existingRows.map((r) => r.kode_pegawai);

  const nowWib = getWibDateTimeString();
  const toInsert: Array<{ id: string; kode: string; nama: string; unit: string }> = [];
  let skipped = 0;

  for (const raw of rows) {
    const nama = clampString(raw.nama_lengkap || '', 120);
    const unit = clampString(raw.unit_kerja || '', 100);
    let kode = raw.kode_pegawai ? sanitizeKodePegawai(raw.kode_pegawai) : '';

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
    toInsert.push({
      id: makeSafeId('peg'),
      kode,
      nama,
      unit,
    });
  }

  try {
    const chunkSize = 200;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.set(doc(db, 'pegawai', item.id), {
          kode_pegawai: item.kode,
          nama_lengkap: item.nama,
          unit_kerja: item.unit,
          is_active: 1,
          created_by: actor.id,
          created_at_wib: nowWib,
          updated_at_wib: nowWib,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      if (i + chunkSize >= toInsert.length && toInsert.length > 0) {
        batch.set(doc(db, 'audit_log', makeSafeId('log')), {
          penerimaan_id: null,
          pegawai_id: null,
          aktor_id: actor.id,
          aktor_nama: clampString(actor.nama_lengkap, 120),
          aksi: 'IMPORT_PEGAWAI',
          alasan: `Impor Excel pegawai (${toInsert.length} ditambahkan, ${skipped} dilewati)`,
          data_sebelum: null,
          data_sesudah: { inserted: toInsert.length, skipped },
          waktu_wib: nowWib,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'pegawai');
  }

  return {
    inserted: toInsert.length,
    skipped,
    message: `Impor selesai: ${toInsert.length} pegawai baru disimpan ke Firebase, ${skipped} baris duplikat/tidak valid dilewati.`,
  };
}

// ── PENERIMAAN MAKANAN ────────────────────────────────────────────────────────

export async function recordPenerimaan(
  emp: Pegawai,
  actor: AuthUser
): Promise<{ id: string; waktu_terima: string; jam_wib: string; petugas: string; message: string }> {
  const todayWib = getWibDateString();
  const nowWib = getWibDateTimeString();
  const jamWib = `${nowWib.split(' ')[1]} WIB`;
  const recId = makeSafeId('rec');
  const lockId = `${emp.id}_${todayWib}`;
  const logId = makeSafeId('log');

  try {
    await runTransaction(db, async (tx) => {
      const lockRef = doc(db, 'daily_locks', lockId);
      const pegRef = doc(db, 'pegawai', emp.id);
      const lockSnap = await tx.get(lockRef);
      const pegSnap = await tx.get(pegRef);

      if (!pegSnap.exists()) {
        throw new AppDomainError('Data pegawai tidak ditemukan.');
      }
      if (Number(pegSnap.data().is_active ?? 0) !== 1) {
        throw new AppDomainError(
          `Pegawai "${emp.nama_lengkap}" berstatus nonaktif dan tidak dapat menerima makanan.`
        );
      }
      if (lockSnap.exists()) {
        throw new AppDomainError(
          `${emp.nama_lengkap} sudah tercatat menerima makanan hari ini (penerimaan ganda dicegah).`
        );
      }

      const pegData = pegSnap.data();
      const recRef = doc(db, 'penerimaan_makanan', recId);
      const logRef = doc(db, 'audit_log', logId);

      tx.set(recRef, {
        pegawai_id: emp.id,
        kode_pegawai: clampString(String(pegData.kode_pegawai ?? emp.kode_pegawai), 32),
        nama_lengkap: clampString(String(pegData.nama_lengkap ?? emp.nama_lengkap), 120),
        unit_kerja: clampString(String(pegData.unit_kerja ?? emp.unit_kerja), 100),
        tanggal_terima: todayWib,
        waktu_terima: nowWib,
        petugas_id: actor.id,
        petugas_nama: clampString(actor.nama_lengkap, 120),
        status: 'sah',
        catatan: null,
        dikoreksi_oleh: null,
        dikoreksi_oleh_nama: null,
        alasan_koreksi: null,
        waktu_koreksi: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(lockRef, {
        penerimaan_id: recId,
        pegawai_id: emp.id,
        tanggal_terima: todayWib,
        petugas_id: actor.id,
        createdAt: serverTimestamp(),
      });

      tx.set(logRef, {
        penerimaan_id: recId,
        pegawai_id: emp.id,
        aktor_id: actor.id,
        aktor_nama: clampString(actor.nama_lengkap, 120),
        aksi: 'CATAT',
        alasan: 'Penyerahan makanan MBB',
        data_sebelum: null,
        data_sesudah: {
          pegawai: clampString(String(pegData.nama_lengkap ?? emp.nama_lengkap), 120),
          tanggal_terima: todayWib,
          waktu_terima: nowWib,
        },
        waktu_wib: nowWib,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof AppDomainError) throw err;
    handleFirestoreError(err, OperationType.WRITE, `penerimaan_makanan/${recId}`);
  }

  return {
    id: recId,
    waktu_terima: nowWib,
    jam_wib: jamWib,
    petugas: actor.nama_lengkap,
    message: `Penerimaan makanan untuk ${emp.nama_lengkap} berhasil dicatat.`,
  };
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

function mapPenerimaanDoc(id: string, data: Record<string, unknown>): PenerimaanRecord {
  return {
    id,
    pegawai_id: String(data.pegawai_id ?? ''),
    kode_pegawai: String(data.kode_pegawai ?? ''),
    nama_lengkap: String(data.nama_lengkap ?? ''),
    unit_kerja: String(data.unit_kerja ?? ''),
    tanggal_terima: String(data.tanggal_terima ?? ''),
    waktu_terima: String(data.waktu_terima ?? ''),
    petugas_id: String(data.petugas_id ?? ''),
    petugas_nama: String(data.petugas_nama ?? ''),
    status: (data.status as PenerimaanStatus) || 'sah',
    catatan: data.catatan ? String(data.catatan) : null,
    dikoreksi_oleh: data.dikoreksi_oleh ? String(data.dikoreksi_oleh) : null,
    dikoreksi_oleh_nama: data.dikoreksi_oleh_nama ? String(data.dikoreksi_oleh_nama) : null,
    alasan_koreksi: data.alasan_koreksi ? String(data.alasan_koreksi) : null,
    waktu_koreksi: data.waktu_koreksi ? String(data.waktu_koreksi) : null,
    created_at: String(data.waktu_terima ?? ''),
  };
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const todayWib = getWibDateString();
  const sevenDaysAgo = addDaysWib(todayWib, -6);

  let activePegawai: Array<{ id: string; unit_kerja: string }> = [];
  try {
    const snap = await getDocs(query(collection(db, 'pegawai'), where('is_active', '==', 1)));
    activePegawai = snap.docs.map((d) => ({
      id: d.id,
      unit_kerja: String(d.data().unit_kerja ?? ''),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'pegawai');
  }

  let rangeRecords: PenerimaanRecord[] = [];
  try {
    const recSnap = await getDocs(
      query(
        collection(db, 'penerimaan_makanan'),
        where('tanggal_terima', '>=', sevenDaysAgo),
        where('tanggal_terima', '<=', todayWib),
        orderBy('tanggal_terima', 'desc')
      )
    );
    rangeRecords = recSnap.docs.map((d) =>
      mapPenerimaanDoc(d.id, d.data() as Record<string, unknown>)
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'penerimaan_makanan');
  }

  const todayAll = rangeRecords
    .filter((r) => r.tanggal_terima === todayWib)
    .sort((a, b) => b.waktu_terima.localeCompare(a.waktu_terima));

  const receivedPegawaiSet = new Set(
    todayAll.filter((r) => r.status === 'sah').map((r) => r.pegawai_id)
  );

  const total_aktif = activePegawai.length;
  const sudah_terima = activePegawai.filter((e) => receivedPegawaiSet.has(e.id)).length;
  const belum_terima = total_aktif - sudah_terima;
  const persentase = total_aktif > 0 ? Math.round((sudah_terima / total_aktif) * 100) : 0;

  const unitMap = new Map<string, { total: number; sudah: number }>();
  for (const emp of activePegawai) {
    const cur = unitMap.get(emp.unit_kerja) ?? { total: 0, sudah: 0 };
    cur.total += 1;
    if (receivedPegawaiSet.has(emp.id)) cur.sudah += 1;
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

  const trenCountMap = new Map<string, number>();
  for (const r of rangeRecords) {
    if (r.status === 'sah') {
      trenCountMap.set(r.tanggal_terima, (trenCountMap.get(r.tanggal_terima) ?? 0) + 1);
    }
  }

  const tren_harian: Array<{ tanggal: string; total_sah: number }> = [];
  for (let i = -6; i <= 0; i++) {
    const t = addDaysWib(todayWib, i);
    tren_harian.push({ tanggal: t, total_sah: trenCountMap.get(t) ?? 0 });
  }

  return {
    tanggal_wib: todayWib,
    total_aktif,
    sudah_terima,
    belum_terima,
    persentase,
    per_unit,
    recent_penerimaan: todayAll.slice(0, 12),
    tren_harian,
  };
}

// ── RIWAYAT, KOREKSI ADMIN, & AUDIT LOG ───────────────────────────────────────

export async function fetchRiwayatRecords(filters: {
  startDate: string;
  endDate: string;
  unit?: string;
  status?: string;
  search?: string;
}): Promise<PenerimaanRecord[]> {
  let all: PenerimaanRecord[] = [];
  try {
    const snap = await getDocs(
      query(
        collection(db, 'penerimaan_makanan'),
        where('tanggal_terima', '>=', filters.startDate),
        where('tanggal_terima', '<=', filters.endDate),
        orderBy('tanggal_terima', 'desc'),
        limit(500)
      )
    );
    all = snap.docs.map((d) => mapPenerimaanDoc(d.id, d.data() as Record<string, unknown>));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'penerimaan_makanan');
  }

  const unit = (filters.unit ?? '').trim();
  const status = (filters.status ?? '').trim();
  const q = (filters.search ?? '').trim().toLowerCase();

  return all
    .filter((rec) => {
      if (unit && rec.unit_kerja !== unit) return false;
      if (status && rec.status !== status) return false;
      if (
        q &&
        !rec.nama_lengkap.toLowerCase().includes(q) &&
        !rec.kode_pegawai.toLowerCase().includes(q) &&
        !rec.petugas_nama.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.waktu_terima.localeCompare(a.waktu_terima));
}

export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'audit_log'), orderBy('createdAt', 'desc'), limit(200))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        penerimaan_id: data.penerimaan_id ? String(data.penerimaan_id) : null,
        pegawai_id: data.pegawai_id ? String(data.pegawai_id) : null,
        aktor_id: String(data.aktor_id ?? ''),
        aktor_nama: String(data.aktor_nama ?? ''),
        aksi: String(data.aksi ?? ''),
        alasan: data.alasan ? String(data.alasan) : null,
        data_sebelum: (data.data_sebelum as Record<string, unknown> | null) ?? null,
        data_sesudah: (data.data_sesudah as Record<string, unknown> | null) ?? null,
        waktu_wib: String(data.waktu_wib ?? ''),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'audit_log');
  }
}

export async function correctPenerimaan(
  record: PenerimaanRecord,
  nextStatus: 'dibatalkan' | 'dikoreksi',
  alasan: string,
  actor: AuthUser
): Promise<string> {
  const cleanReason = clampString(alasan, 500);
  if (cleanReason.length < 5) {
    throw new AppDomainError('Alasan koreksi wajib diisi minimal 5 karakter sebagai rekam jejak.');
  }

  const nowWib = getWibDateTimeString();
  const logId = makeSafeId('log');
  const lockId = `${record.pegawai_id}_${record.tanggal_terima}`;

  try {
    await runTransaction(db, async (tx) => {
      const recRef = doc(db, 'penerimaan_makanan', record.id);
      const recSnap = await tx.get(recRef);
      if (!recSnap.exists()) {
        throw new AppDomainError('Catatan penerimaan tidak ditemukan.');
      }
      const existingData = recSnap.data();
      if (existingData.status === 'dibatalkan') {
        throw new AppDomainError('Catatan penerimaan ini sudah dibatalkan sebelumnya.');
      }

      const lockRef = doc(db, 'daily_locks', lockId);
      const lockSnap = nextStatus === 'dibatalkan' ? await tx.get(lockRef) : null;

      tx.update(recRef, {
        status: nextStatus,
        dikoreksi_oleh: actor.id,
        dikoreksi_oleh_nama: clampString(actor.nama_lengkap, 120),
        alasan_koreksi: cleanReason,
        waktu_koreksi: nowWib,
        updatedAt: serverTimestamp(),
      });

      if (nextStatus === 'dibatalkan' && lockSnap?.exists()) {
        if (lockSnap.data().penerimaan_id === record.id) {
          tx.delete(lockRef);
        }
      }

      tx.set(doc(db, 'audit_log', logId), {
        penerimaan_id: record.id,
        pegawai_id: record.pegawai_id,
        aktor_id: actor.id,
        aktor_nama: clampString(actor.nama_lengkap, 120),
        aksi: nextStatus === 'dibatalkan' ? 'BATALKAN' : 'KOREKSI',
        alasan: cleanReason,
        data_sebelum: {
          status: String(existingData.status ?? 'sah'),
          waktu_terima: String(existingData.waktu_terima ?? ''),
          petugas_nama: String(existingData.petugas_nama ?? ''),
          pegawai: record.nama_lengkap,
        },
        data_sesudah: {
          status: nextStatus,
          alasan_koreksi: cleanReason,
          waktu_koreksi: nowWib,
          dikoreksi_oleh: clampString(actor.nama_lengkap, 120),
        },
        waktu_wib: nowWib,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof AppDomainError) throw err;
    handleFirestoreError(err, OperationType.UPDATE, `penerimaan_makanan/${record.id}`);
  }

  return nextStatus === 'dibatalkan'
    ? `Penerimaan atas nama ${record.nama_lengkap} berhasil dibatalkan dan tercatat pada rekam jejak.`
    : `Penerimaan atas nama ${record.nama_lengkap} berhasil dikoreksi dan tercatat pada rekam jejak.`;
}

// ── REKAPITULASI & EKSPOR EXCEL ───────────────────────────────────────────────

export async function fetchRecapData(
  role: UserRole,
  startDate: string,
  endDate: string,
  unit: string
): Promise<{ recap: RecapData; details: PenerimaanRecord[] }> {
  const { pegawai } = await fetchPegawaiWithToday(role);
  const filteredPegawai = unit ? pegawai.filter((p) => p.unit_kerja === unit) : pegawai;

  let records: PenerimaanRecord[] = [];
  try {
    const snap = await getDocs(
      query(
        collection(db, 'penerimaan_makanan'),
        where('tanggal_terima', '>=', startDate),
        where('tanggal_terima', '<=', endDate),
        orderBy('tanggal_terima', 'desc')
      )
    );
    records = snap.docs
      .map((d) => mapPenerimaanDoc(d.id, d.data() as Record<string, unknown>))
      .filter((r) => !unit || r.unit_kerja === unit)
      .sort((a, b) => b.waktu_terima.localeCompare(a.waktu_terima));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'penerimaan_makanan');
  }

  const byPegawai = new Map<string, PenerimaanRecord[]>();
  for (const rec of records) {
    const arr = byPegawai.get(rec.pegawai_id) ?? [];
    arr.push(rec);
    byPegawai.set(rec.pegawai_id, arr);
  }

  const per_pegawai: EmployeeRecapRow[] = filteredPegawai
    .map((emp) => {
      const empRecs = byPegawai.get(emp.id) ?? [];
      const sahRecs = empRecs.filter((r) => r.status === 'sah');
      const batalRecs = empRecs.filter((r) => r.status === 'dibatalkan');
      const terakhir =
        sahRecs.length > 0
          ? sahRecs.map((r) => r.waktu_terima).sort().reverse()[0]
          : null;
      return {
        pegawai_id: emp.id,
        kode_pegawai: emp.kode_pegawai,
        nama_lengkap: emp.nama_lengkap,
        unit_kerja: emp.unit_kerja,
        is_active: emp.is_active,
        jumlah_sah: sahRecs.length,
        jumlah_dibatalkan: batalRecs.length,
        terakhir_terima: terakhir,
      };
    })
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return b.is_active - a.is_active;
      const u = a.unit_kerja.localeCompare(b.unit_kerja, 'id');
      if (u !== 0) return u;
      return a.nama_lengkap.localeCompare(b.nama_lengkap, 'id');
    });

  const unitMap = new Map<
    string,
    { jumlah_pegawai: number; total_sah: number; total_dibatalkan: number }
  >();
  let total_sah = 0;
  let total_dibatalkan = 0;

  for (const row of per_pegawai) {
    total_sah += row.jumlah_sah;
    total_dibatalkan += row.jumlah_dibatalkan;
    const cur = unitMap.get(row.unit_kerja) ?? {
      jumlah_pegawai: 0,
      total_sah: 0,
      total_dibatalkan: 0,
    };
    cur.jumlah_pegawai += 1;
    cur.total_sah += row.jumlah_sah;
    cur.total_dibatalkan += row.jumlah_dibatalkan;
    unitMap.set(row.unit_kerja, cur);
  }

  const per_unit = Array.from(unitMap.entries())
    .map(([unit_kerja, v]) => ({ unit_kerja, ...v }))
    .sort((a, b) => a.unit_kerja.localeCompare(b.unit_kerja, 'id'));

  return {
    recap: {
      startDate,
      endDate,
      total_pegawai: per_pegawai.length,
      total_sah,
      total_dibatalkan,
      per_unit,
      per_pegawai,
    },
    details: records,
  };
}

export async function exportRecapToExcel(
  recap: RecapData,
  details: PenerimaanRecord[]
): Promise<void> {
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
      status: d.status,
      alasan: d.alasan_koreksi ?? '-',
      korektor: d.dikoreksi_oleh_nama ?? '-',
    });
  });
  styleHeader(wsDetail);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `Rekap_MBB_PTA_Babel_${recap.startDate}_sd_${recap.endDate}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

// ── AKUN PETUGAS & ADMIN (STAFF INVITES & USERS) ──────────────────────────────

export async function fetchStaffAccounts(): Promise<StaffInvite[]> {
  let invites: StaffInvite[] = [];
  let usersByInvite = new Map<string, { uid: string; is_active: number }>();

  try {
    const [invSnap, usrSnap] = await Promise.all([
      getDocs(query(collection(db, 'staff_invites'), orderBy('nama_lengkap', 'asc'))),
      getDocs(query(collection(db, 'users'), orderBy('nama_lengkap', 'asc'))),
    ]);

    for (const uDoc of usrSnap.docs) {
      const ud = uDoc.data();
      if (ud.inviteId) {
        usersByInvite.set(String(ud.inviteId), {
          uid: uDoc.id,
          is_active: Number(ud.is_active ?? 1),
        });
      }
    }

    invites = invSnap.docs.map((d) => {
      const data = d.data();
      const linked = usersByInvite.get(d.id);
      return {
        id: d.id,
        email: String(data.email ?? ''),
        nama_lengkap: String(data.nama_lengkap ?? ''),
        role: data.role === 'admin' ? 'admin' : 'petugas',
        is_active: Number(data.is_active ?? 1),
        uid: linked?.uid ?? null,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'staff_invites');
  }

  return invites;
}

export async function createStaffInvite(
  input: { email: string; nama_lengkap: string; role: UserRole },
  actor: AuthUser
): Promise<string> {
  const cleanEmail = clampString(input.email.toLowerCase(), 160);
  const cleanName = clampString(input.nama_lengkap, 120);
  const cleanRole: UserRole = input.role === 'admin' ? 'admin' : 'petugas';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new AppDomainError('Masukkan alamat email Google yang valid (contoh: petugas@gmail.com).');
  }
  if (cleanEmail === BOOTSTRAPPED_ADMIN_EMAIL) {
    throw new AppDomainError('Email Admin utama sudah terdaftar secara otomatis.');
  }
  if (cleanName.length < 2) {
    throw new AppDomainError('Nama lengkap minimal 2 karakter.');
  }

  const inviteId = await emailToInviteId(cleanEmail);
  try {
    const existing = await getDoc(doc(db, 'staff_invites', inviteId));
    if (existing.exists()) {
      throw new AppDomainError(`Email ${cleanEmail} sudah terdaftar di daftar akun.`);
    }

    await setDoc(doc(db, 'staff_invites', inviteId), {
      email: cleanEmail,
      nama_lengkap: cleanName,
      role: cleanRole,
      is_active: 1,
      createdBy: actor.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (err instanceof AppDomainError) throw err;
    handleFirestoreError(err, OperationType.WRITE, `staff_invites/${inviteId}`);
  }

  return `Akun ${cleanRole === 'admin' ? 'Admin' : 'Petugas'} (${cleanEmail}) berhasil ditambahkan ke Firebase.`;
}

export async function toggleStaffInviteStatus(
  invite: StaffInvite,
  nextActive: 0 | 1
): Promise<string> {
  try {
    await updateDoc(doc(db, 'staff_invites', invite.id), {
      is_active: nextActive,
      updatedAt: serverTimestamp(),
    });

    if (invite.uid) {
      await updateDoc(doc(db, 'users', invite.uid), {
        is_active: nextActive,
        updatedAt: serverTimestamp(),
      });
      if (invite.role === 'admin') {
        const adminSnap = await getDoc(doc(db, 'admins', invite.uid));
        if (adminSnap.exists()) {
          await updateDoc(doc(db, 'admins', invite.uid), {
            is_active: nextActive,
          });
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `staff_invites/${invite.id}`);
  }

  return nextActive === 1
    ? `Akun ${invite.nama_lengkap} diaktifkan kembali.`
    : `Akun ${invite.nama_lengkap} dinonaktifkan.`;
}
