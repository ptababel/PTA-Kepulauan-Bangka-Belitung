import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from './db';
import type { AuthUser, UserRole } from '../src/types';

// In-memory random fallback when SESSION_SECRET env var is unset
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  return process.env.SESSION_SECRET?.trim() || EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

interface TokenPayload {
  uid: number;
  role: UserRole;
  exp: number;
}

export function createSessionToken(user: { id: number; role: UserRole }): string {
  const payload: TokenPayload = {
    uid: user.id,
    role: user.role,
    exp: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.uid || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasAnyAdmin(): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND is_active = 1")
    .get() as { cnt: number };
  return row.cnt > 0;
}

export function getEnvAdminPasscode(): string {
  return process.env.ADMIN_PASSCODE?.trim() || '';
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, message: 'Sesi tidak ditemukan. Silakan login kembali.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ ok: false, message: 'Sesi telah berakhir atau tidak valid.' });
    return;
  }

  const db = getDb();
  const user = db
    .prepare('SELECT id, username, nama_lengkap, role, is_active FROM users WHERE id = ?')
    .get(payload.uid) as AuthUser | undefined;

  if (!user || user.is_active !== 1) {
    res.status(401).json({ ok: false, message: 'Akun tidak aktif atau tidak ditemukan.' });
    return;
  }

  req.authUser = user;
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ ok: false, message: 'Autentikasi diperlukan.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({
      ok: false,
      message: 'Akses ditolak. Fitur ini hanya tersedia untuk Admin.',
    });
    return;
  }
  next();
}
