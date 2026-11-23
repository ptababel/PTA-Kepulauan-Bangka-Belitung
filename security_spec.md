# Security Specification — Absen MBB PTA Kepulauan Bangka Belitung

## 1. Data Invariants
1. **Identity & Privilege Separation**: Only verified Google accounts (`request.auth.token.email_verified == true`) whose email matches `ptababel@gmail.com` or an active `/staff_invites/{inviteId}` record may initialize `/users/{uid}` and receive `admin` or `petugas` access. Self-assigned `role: "admin"` without an authorized invite is denied.
2. **PII Isolation**: User email addresses reside exclusively inside `/users/{userId}/private/info` readable only by the owner or an active Admin.
3. **Employee Master Integrity**: Only active Admins can create, edit, or toggle active status of `/pegawai/{pegawaiId}` documents. Petugas can read active employees but cannot create, update, or delete them.
4. **Duplicate Receipt Prevention**: Creating a `'sah'` receipt in `/penerimaan_makanan/{penerimaanId}` MUST atomically create `/daily_locks/{pegawaiId}_{tanggal_terima}` in the same transaction (`existsAfter` check) and fails if that daily lock already exists.
5. **Admin-Only Corrections & Immutable Audit Trail**: Only active Admins may update `/penerimaan_makanan/{penerimaanId}` (with required `alasan_koreksi` >= 5 chars and state-lock checks), and `/audit_log/{logId}` is strictly append-only (`allow update, delete: if false`).
6. **Server Timestamps & Strict Key Allowlists**: Every document creation/update validates `request.time` and enforces `keys().hasAll(...) && keys().hasOnly(...)` / `affectedKeys().hasOnly(...)` to block shadow fields and client clock tampering.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Admin Escalation on `/users/{uid}`**: Attacker sets `role: "admin"` without an authorized admin invite (`PERMISSION_DENIED`).
2. **Unverified Email Spoofing**: User with `email_verified: false` matching admin email attempts read/write (`PERMISSION_DENIED`).
3. **Shadow Field Injection on `/pegawai/{id}`**: Admin/user sends extra ghost field `{ isVerified: true }` (`PERMISSION_DENIED`).
4. **Petugas Editing Employee Name**: Active `petugas` attempts `update` on `/pegawai/{id}` (`PERMISSION_DENIED`).
5. **Client Timestamp Forgery**: Payload supplies custom past/future Date instead of `request.time` (`PERMISSION_DENIED`).
6. **ID Poisoning**: Document ID containing 200+ characters or invalid symbols (`/` / `.`) (`PERMISSION_DENIED`).
7. **Orphaned Receipt Without Active Employee**: Creating `/penerimaan_makanan/{id}` pointing to nonexistent or inactive `pegawai_id` (`PERMISSION_DENIED`).
8. **Bypassing Daily Lock Atomicity**: Creating `/penerimaan_makanan/{id}` directly without atomically creating `/daily_locks/{pegawai_id}_{tanggal_terima}` (`PERMISSION_DENIED`).
9. **Impersonating Another Petugas**: Petugas creates receipt with `petugas_id != request.auth.uid` (`PERMISSION_DENIED`).
10. **Petugas Cancelling/Modifying Receipt**: Active `petugas` attempts `update` or `delete` on `/penerimaan_makanan/{id}` (`PERMISSION_DENIED`).
11. **Mutating/Deleting Audit Log**: Even an Admin attempts `update` or `delete` on `/audit_log/{id}` (`PERMISSION_DENIED`).
12. **PII Leak Across Users**: Non-admin user attempts `get` on another user's `/users/{otherUid}/private/info` (`PERMISSION_DENIED`).
