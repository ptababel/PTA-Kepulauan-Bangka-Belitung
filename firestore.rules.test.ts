import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const blueprint = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8')
);
const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

test('firestore.rules starts with default-deny catch-all and defines match blocks for every blueprint collection', () => {
  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);

  const requiredMatches = [
    'match /users/{userId}',
    'match /private/{docId}',
    'match /admins/{userId}',
    'match /staff_invites/{inviteId}',
    'match /pegawai/{pegawaiId}',
    'match /penerimaan_makanan/{penerimaanId}',
    'match /daily_locks/{lockId}',
    'match /audit_log/{logId}',
  ];

  for (const m of requiredMatches) {
    assert.ok(rules.includes(m), `Missing rules match block: ${m}`);
  }

  assert.ok(Object.keys(blueprint.firestore).length >= 8);
});

test('Dirty Dozen security invariants are enforced in firestore.rules', () => {
  // 1 & 2: Verified email & bootstrapped admin
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /ptababel@gmail\.com/);

  // 3: Strict keys & affectedKeys checks prevent shadow fields
  assert.match(rules, /data\.keys\(\)\.hasAll\(/);
  assert.match(rules, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(/);

  // 4 & 10: Pegawai updates and Penerimaan updates restricted to Admin
  assert.match(rules, /match \/pegawai\/\{pegawaiId\}[\s\S]*allow update: if isValidId\(pegawaiId\) &&\s*isAdmin\(\)/);
  assert.match(rules, /match \/penerimaan_makanan\/\{penerimaanId\}[\s\S]*allow update: if isValidId\(penerimaanId\) &&\s*isAdmin\(\)/);

  // 5: Server timestamp enforcement
  assert.match(rules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rules, /incoming\(\)\.updatedAt == request\.time/);

  // 6: ID poisoning guard
  assert.match(rules, /function isValidId\(id\)[\s\S]*id\.size\(\) <= 128/);

  // 7 & 8: Orphaned receipt check + atomic daily_lock guarantee
  assert.match(rules, /existsAfter\(\/databases\/\$\(database\)\/documents\/daily_locks\//);
  assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/pegawai\/\$\(incoming\(\)\.pegawai_id\)\)\.data\.is_active == 1/);

  // 9: Petugas impersonation guard
  assert.match(rules, /incoming\(\)\.petugas_id == request\.auth\.uid/);

  // 11: Audit log immutability
  assert.match(rules, /match \/audit_log\/\{logId\}[\s\S]*allow update, delete: if false;/);

  // 12: Private PII isolation
  assert.match(rules, /match \/private\/\{docId\}[\s\S]*allow get: if isValidId\(userId\) && docId == 'info' && \(isOwner\(userId\) \|\| isAdmin\(\)\)/);
  assert.doesNotMatch(rules, /allow read: if true;/);
  assert.doesNotMatch(rules, /allow write: if true;/);
  assert.doesNotMatch(rules, /allow list: if isSignedIn\(\);/);
});
