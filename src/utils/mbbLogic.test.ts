import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWibDateString,
  getWibDateTimeString,
  extractWibTime,
  formatIndonesianDate,
  addDaysWib,
} from './wib';
import {
  filterEmployees,
  parseExcelEmployeeRows,
  computeDistributionStats,
  formatNextKodePegawai,
} from './mbbLogic';
import type { Pegawai } from '../types';

test('WIB date & time conversion handles UTC midnight rollover into UTC+7', () => {
  // 2026-11-22T18:30:00Z is 2026-11-23 01:30:00 WIB
  const utcDate = new Date('2026-11-22T18:30:00.000Z');
  assert.equal(getWibDateString(utcDate), '2026-11-23');
  assert.equal(getWibDateTimeString(utcDate), '2026-11-23 01:30:00');
  assert.equal(extractWibTime('2026-11-23 01:30:00'), '01:30:00 WIB');
  assert.equal(formatIndonesianDate('2026-11-23'), '23 November 2026');
  assert.equal(addDaysWib('2026-11-23', -6), '2026-11-17');
});

test('filterEmployees filters by search, unit, receipt status, and active status', () => {
  const sample: Pegawai[] = [
    {
      id: 1,
      kode_pegawai: 'MBB-001',
      nama_lengkap: 'Ahmad Fauzi',
      unit_kerja: 'Kepaniteraan',
      is_active: 1,
      created_at: '',
      updated_at: '',
      penerimaan_id: 10,
    },
    {
      id: 2,
      kode_pegawai: 'MBB-002',
      nama_lengkap: 'Siti Rahma',
      unit_kerja: 'Kesekretariatan',
      is_active: 1,
      created_at: '',
      updated_at: '',
      penerimaan_id: null,
    },
    {
      id: 3,
      kode_pegawai: 'MBB-003',
      nama_lengkap: 'Budi Santoso',
      unit_kerja: 'Kepaniteraan',
      is_active: 0,
      created_at: '',
      updated_at: '',
      penerimaan_id: null,
    },
  ];

  assert.equal(filterEmployees(sample, { search: 'fauzi', unit: '' }).length, 1);
  assert.equal(
    filterEmployees(sample, { search: '', unit: 'Kepaniteraan', activeFilter: 'active' }).length,
    1
  );
  assert.equal(
    filterEmployees(sample, { search: '', unit: '', status: 'belum', activeFilter: 'active' })[0]
      .id,
    2
  );
});

test('parseExcelEmployeeRows normalizes Indonesian headers and flags invalid/duplicate rows', () => {
  const parsed = parseExcelEmployeeRows([
    { 'Nama Lengkap': 'H. Sulaiman', 'Unit Kerja': 'Pimpinan', 'Kode Pegawai': 'MBB-010' },
    { Nama: 'Nurul Hidayah', Bagian: 'Kepegawaian & TI' },
    { 'Nama Lengkap': '', 'Unit Kerja': 'Umum' },
    { 'Nama Lengkap': 'Nurul Hidayah', 'Unit Kerja': 'Kepegawaian & TI' },
  ]);

  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].valid, true);
  assert.equal(parsed[0].kode_pegawai, 'MBB-010');
  assert.equal(parsed[1].valid, true);
  assert.equal(parsed[1].unit_kerja, 'Kepegawaian & TI');
  assert.equal(parsed[2].valid, false);
  assert.equal(parsed[3].valid, false);
});

test('computeDistributionStats and formatNextKodePegawai calculate accurately', () => {
  const list: Pegawai[] = [
    {
      id: 1,
      kode_pegawai: 'MBB-001',
      nama_lengkap: 'A',
      unit_kerja: 'Kepaniteraan',
      is_active: 1,
      created_at: '',
      updated_at: '',
      penerimaan_id: 1,
    },
    {
      id: 2,
      kode_pegawai: 'MBB-002',
      nama_lengkap: 'B',
      unit_kerja: 'Kepaniteraan',
      is_active: 1,
      created_at: '',
      updated_at: '',
      penerimaan_id: null,
    },
    {
      id: 3,
      kode_pegawai: 'MBB-009',
      nama_lengkap: 'C',
      unit_kerja: 'Umum',
      is_active: 0,
      created_at: '',
      updated_at: '',
      penerimaan_id: null,
    },
  ];

  const stats = computeDistributionStats(list);
  assert.equal(stats.total_aktif, 2);
  assert.equal(stats.sudah_terima, 1);
  assert.equal(stats.belum_terima, 1);
  assert.equal(stats.persentase, 50);
  assert.equal(stats.per_unit[0].unit_kerja, 'Kepaniteraan');

  assert.equal(formatNextKodePegawai(['MBB-001', 'MBB-009', 'MBB-004']), 'MBB-010');
});
