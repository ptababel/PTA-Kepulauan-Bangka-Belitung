<?php
declare(strict_types=1);
require_once __DIR__ . '/includes/auth.php';
$user = requireLogin();
$pdo = getPDO();

$today = nowWIB()->format('Y-m-d');

// Ambil semua pegawai aktif beserta status penerimaan hari ini
$stmt = $pdo->prepare("
    SELECT
        p.id, p.kode_pegawai, p.nama_lengkap, p.unit_kerja,
        pm.id AS penerimaan_id, pm.waktu_terima, u.nama_lengkap AS nama_petugas
    FROM pegawai p
    LEFT JOIN penerimaan_makanan pm
        ON pm.pegawai_id = p.id AND pm.tanggal_terima = ? AND pm.status = 'sah'
    LEFT JOIN users u ON u.id = pm.petugas_id
    WHERE p.is_active = 1
    ORDER BY (pm.id IS NOT NULL) ASC, p.nama_lengkap ASC
");
$stmt->execute([$today]);
$daftar = $stmt->fetchAll();

$units = $pdo->query("SELECT DISTINCT unit_kerja FROM pegawai WHERE is_active = 1 ORDER BY unit_kerja ASC")->fetchAll(PDO::FETCH_COLUMN);

$pageTitle = 'Penerimaan Makanan - Absen MBB';
require_once __DIR__ . '/includes/layout_top.php';
?>

<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
  <div>
    <h4 class="fw-bold mb-0 text-success">Penerimaan Makanan</h4>
    <small class="text-muted">Tanggal: <strong><?= nowWIB()->format('d F Y') ?></strong> (WIB) &bull; Petugas: <strong><?= e($user['nama_lengkap']) ?></strong></small>
  </div>
  <button class="btn btn-outline-success btn-sm" onclick="location.reload()">
    <i class="bi bi-arrow-clockwise"></i> Sinkronkan Data
  </button>
</div>

<!-- Filter & Pencarian -->
<div class="card card-stat bg-white p-3 mb-3">
  <div class="row g-2">
    <div class="col-12 col-md-5">
      <div class="input-group">
        <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
        <input type="text" id="searchNama" class="form-control" placeholder="Cari nama pegawai...">
      </div>
    </div>
    <div class="col-6 col-md-4">
      <select id="filterUnit" class="form-select">
        <option value="">-- Semua Unit Kerja --</option>
        <?php foreach ($units as $unit): ?>
          <option value="<?= e(strtolower($unit)) ?>"><?= e($unit) ?></option>
        <?php endforeach; ?>
      </select>
    </div>
    <div class="col-6 col-md-3">
      <select id="filterStatus" class="form-select">
        <option value="">Semua Status</option>
        <option value="belum">Belum Diterima</option>
        <option value="sudah">Sudah Diterima</option>
      </select>
    </div>
  </div>
</div>

<!-- Daftar Pegawai (Responsif: Kartu di HP/Tablet, Tabel rapi di Desktop atau Kartu universal) -->
<div class="row g-2" id="listContainer">
  <?php if (empty($daftar)): ?>
    <div class="col-12">
      <div class="alert alert-info">Belum ada data pegawai aktif. Silakan hubungi Admin untuk menambahkan data pegawai.</div>
    </div>
  <?php else: ?>
    <?php foreach ($daftar as $row):
      $sudah = !empty($row['penerimaan_id']);
      $jamWib = $sudah ? date('H:i:s', strtotime($row['waktu_terima'])) . ' WIB' : '';
    ?>
    <div class="col-12 col-md-6 col-xl-4 pegawai-item"
         data-nama="<?= e(strtolower($row['nama_lengkap'])) ?>"
         data-unit="<?= e(strtolower($row['unit_kerja'])) ?>"
         data-status="<?= $sudah ? 'sudah' : 'belum' ?>">
      <div class="card card-stat bg-white p-3 h-100 <?= $sudah ? 'border-start border-4 border-success bg-success-subtle bg-opacity-10' : '' ?>" id="card-<?= (int)$row['id'] ?>">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
          <div>
            <div class="fw-bold fs-6 text-dark"><?= e($row['nama_lengkap']) ?></div>
            <div class="text-muted small"><i class="bi bi-building"></i> <?= e($row['unit_kerja']) ?></div>
          </div>
          <span class="badge <?= $sudah ? 'bg-success' : 'bg-warning text-dark' ?>" id="badge-<?= (int)$row['id'] ?>">
            <?= $sudah ? 'Sudah Diterima' : 'Belum' ?>
          </span>
        </div>

        <div class="mt-auto pt-2 border-top" id="action-area-<?= (int)$row['id'] ?>">
          <?php if ($sudah): ?>
            <div class="small text-success fw-semibold">
              <i class="bi bi-check-circle-fill"></i> Diterima pukul <?= e($jamWib) ?>
            </div>
            <div class="small text-muted">Dicatat oleh: <?= e($row['nama_petugas']) ?></div>
          <?php else: ?>
            <button type="button"
                    class="btn btn-success w-100 btn-terima"
                    onclick="catatPenerimaan(<?= (int)$row['id'] ?>, <?= json_encode($row['nama_lengkap']) ?>, this)">
              <i class="bi bi-hand-thumbs-up-fill"></i> Sudah Diterima
            </button>
          <?php endif; ?>
        </div>
      </div>
    </div>
    <?php endforeach; ?>
  <?php endif; ?>
</div>

<script>
const CSRF_TOKEN = <?= json_encode(csrfToken()) ?>;

function applyFilters() {
  const q = document.getElementById('searchNama').value.trim().toLowerCase();
  const unit = document.getElementById('filterUnit').value;
  const status = document.getElementById('filterStatus').value;

  document.querySelectorAll('.pegawai-item').forEach(el => {
    const matchNama = el.dataset.nama.includes(q);
    const matchUnit = !unit || el.dataset.unit === unit;
    const matchStatus = !status || el.dataset.status === status;
    el.style.display = (matchNama && matchUnit && matchStatus) ? '' : 'none';
  });
}

document.getElementById('searchNama').addEventListener('input', applyFilters);
document.getElementById('filterUnit').addEventListener('change', applyFilters);
document.getElementById('filterStatus').addEventListener('change', applyFilters);

async function catatPenerimaan(pegawaiId, namaPegawai, btn) {
  const konfirmasi = await Swal.fire({
    title: 'Konfirmasi Penyerahan',
    html: `Pastikan makanan benar-benar diserahkan kepada:<br><strong>${namaPegawai}</strong>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#0b6623',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Ya, Sudah Diterima',
    cancelButtonText: 'Batal'
  });

  if (!konfirmasi.isConfirmed) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

  try {
    const res = await fetch('api_penerimaan.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pegawai_id: pegawaiId, csrf_token: CSRF_TOKEN })
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      const card = document.getElementById('card-' + pegawaiId);
      const badge = document.getElementById('badge-' + pegawaiId);
      const actionArea = document.getElementById('action-area-' + pegawaiId);
      const itemWrapper = card.closest('.pegawai-item');

      card.classList.add('border-start', 'border-4', 'border-success');
      badge.className = 'badge bg-success';
      badge.textContent = 'Sudah Diterima';
      itemWrapper.dataset.status = 'sudah';

      actionArea.innerHTML = `
        <div class="small text-success fw-semibold">
          <i class="bi bi-check-circle-fill"></i> Diterima pukul ${data.jam_wib}
        </div>
        <div class="small text-muted">Dicatat oleh: ${data.petugas}</div>
      `;

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: data.message,
        showConfirmButton: false,
        timer: 2500
      });
    } else {
      Swal.fire('Perhatian', data.message || 'Gagal mencatat penerimaan.', 'warning');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-hand-thumbs-up-fill"></i> Sudah Diterima';
    }
  } catch (err) {
    Swal.fire('Kesalahan Koneksi', 'Tidak dapat terhubung ke server.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-hand-thumbs-up-fill"></i> Sudah Diterima';
  }
}
</script>

<?php require_once __DIR__ . '/includes/layout_bottom.php'; ?>