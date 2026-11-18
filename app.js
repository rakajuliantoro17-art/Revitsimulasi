// Simulasi Perhitungan Pajak Transaksi Sekolah
// Logika di fungsi hitung() murni (tanpa DOM) supaya mudah diuji dan diubah.

const CFG = {
  PPN: 0.11,                  // TARIF_PPN
  BATAS_TRANSAKSI: 2000000,   // PPN dan PPh 22 hanya jika DPP di atas ini
  BATAS_UPAH_HARIAN: 450000,  // upah harian <= ini bebas PPh 21
  BATAS_UPAH_ATAS: 2500000
};

const JENIS = [
  'Honorarium Tenaga Ahli (PPh 21)',
  'Upah Tukang (PPh 21)',
  'Pembelian Barang (PPh 22)',
  'Pembelian Jasa / Sewa (PPh 23)',
  'Jasa Konsultasi Konstruksi (PPh 4(2))'
];
const NPWP = ['Ber-NPWP / SBU', 'Non-NPWP / Non-SBU'];
const YATIDAK = ['Ya', 'Tidak'];

const num = v => {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : 0;
};

function pasal17(pkp) {
  const lapisan = [
    [60000000, 0.05], [190000000, 0.15], [250000000, 0.25], [4500000000, 0.30], [Infinity, 0.35]
  ];
  let pajak = 0, sisa = pkp;
  for (const [batas, tarif] of lapisan) {
    if (sisa <= 0) break;
    const kena = Math.min(sisa, batas);
    pajak += kena * tarif;
    sisa -= kena;
  }
  return pajak;
}

// Padanan kalkulasiPajak() di Code.gs.
// Beda disengaja: Code.gs memakai includes('sbu'), sehingga "Non-NPWP / Non-SBU"
// ikut terbaca ber-NPWP. Di sini status dibaca persis dari pilihan dropdown.
function hitung(r) {
  const bruto = num(r.bruto);
  const jmlHari = Math.max(1, num(r.hari) || 1);
  const ber = r.npwp === NPWP[0];
  const inklusif = r.termasukPpn === 'Ya';
  const catatan = [];

  if (bruto <= 0) {
    return { dpp: 0, ppn: 0, jenisPph: '-', tarif: 0, nominal: 0, netto: 0, catatan: '' };
  }

  let dpp = bruto, ppn = 0, jenisPph = '-', tarif = 0, nominal = 0;
  const objekPpn = r.jenis === JENIS[2] || r.jenis === JENIS[3] || r.jenis === JENIS[4];

  if (objekPpn) {
    dpp = inklusif ? Math.round(bruto / (1 + CFG.PPN)) : bruto;
    if (dpp > CFG.BATAS_TRANSAKSI) ppn = Math.round(dpp * CFG.PPN);
    else catatan.push('DPP <= Rp2.000.000: tanpa PPN.');
  }

  switch (r.jenis) {
    case JENIS[0]: {
      jenisPph = 'PPh Pasal 21';
      let p = pasal17(dpp * 0.5);
      if (!ber) p *= 1.2;
      nominal = Math.round(p);
      tarif = dpp ? nominal / dpp : 0;
      break;
    }
    case JENIS[1]: {
      jenisPph = 'PPh Pasal 21';
      const perHari = dpp / jmlHari;
      if (perHari <= CFG.BATAS_UPAH_HARIAN) tarif = 0;
      else if (perHari <= CFG.BATAS_UPAH_ATAS) tarif = 0.005;
      else tarif = 0.025;
      nominal = Math.round(dpp * tarif);
      break;
    }
    case JENIS[2]:
      if (dpp > CFG.BATAS_TRANSAKSI) {
        jenisPph = 'PPh Pasal 22';
        tarif = ber ? 0.015 : 0.03;
        nominal = Math.round(dpp * tarif);
      } else {
        jenisPph = 'Bebas PPh 22 (≤ 2 Jt)';
      }
      break;
    case JENIS[3]:
      jenisPph = 'PPh Pasal 23';
      tarif = ber ? 0.02 : 0.04;
      nominal = Math.round(dpp * tarif);
      break;
    case JENIS[4]:
      jenisPph = 'PPh Pasal 4(2) Final';
      tarif = ber ? 0.035 : 0.06;
      nominal = Math.round(dpp * tarif);
      break;
    default:
      break;
  }

  const totalTagihan = inklusif ? bruto : dpp + ppn;
  return { dpp, ppn, jenisPph, tarif, nominal, netto: totalTagihan - ppn - nominal, catatan: catatan.join(' ') };
}

if (typeof module !== 'undefined') module.exports = { hitung, CFG, JENIS, NPWP };

// ---------------- UI ----------------
if (typeof document !== 'undefined') {
  const KEY = 'simulasi-pajak-v1';
  const $ = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
  const pct = t => (t ? (t * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%' : '-');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const baru = () => ({
    tanggal: new Date().toISOString().slice(0, 10),
    uraian: '', rekanan: '',
    jenis: JENIS[2], npwp: NPWP[0],
    bruto: '', termasukPpn: 'Tidak', hari: ''
  });

  let rows = [];
  try { rows = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { rows = []; }
  if (!rows.length) rows = [baru()];

  const simpan = () => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) { /* abaikan */ } };
  const opts = (list, sel) => list.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');

  function render() {
    $('tbody').innerHTML = rows.map((r, i) => `
      <tr data-i="${i}">
        <td><input type="date" data-k="tanggal" value="${esc(r.tanggal)}"></td>
        <td><input type="text" data-k="uraian" value="${esc(r.uraian)}"></td>
        <td><input type="text" data-k="rekanan" value="${esc(r.rekanan)}"></td>
        <td><select data-k="jenis">${opts(JENIS, r.jenis)}</select></td>
        <td><select data-k="npwp">${opts(NPWP, r.npwp)}</select></td>
        <td><input type="number" min="0" data-k="bruto" value="${esc(r.bruto)}"></td>
        <td><select data-k="termasukPpn">${opts(YATIDAK, r.termasukPpn)}</select></td>
        <td><input type="number" min="0" data-k="hari" value="${esc(r.hari)}"></td>
        <td class="n c-dpp"></td><td class="n c-ppn"></td>
        <td class="c-jp"></td><td class="n c-tarif"></td>
        <td class="n c-pph"></td><td class="n c-netto"></td>
        <td class="note c-cat"></td>
        <td><button type="button" class="del" title="Hapus baris">&times;</button></td>
      </tr>`).join('');
    rows.forEach((_, i) => hitungBaris(i));
    ringkas();
  }

  function hitungBaris(i) {
    const tr = $('tbody').children[i];
    const r = rows[i];
    const h = hitung(r);
    const upah = r.jenis === JENIS[1];
    const noPpn = r.jenis === JENIS[0] || upah;
    tr.querySelector('[data-k=hari]').disabled = !upah;
    tr.querySelector('[data-k=termasukPpn]').disabled = noPpn;
    tr.querySelector('.c-dpp').textContent = fmt(h.dpp);
    tr.querySelector('.c-ppn').textContent = fmt(h.ppn);
    tr.querySelector('.c-jp').textContent = h.jenisPph;
    tr.querySelector('.c-tarif').textContent = pct(h.tarif);
    tr.querySelector('.c-pph').textContent = fmt(h.nominal);
    tr.querySelector('.c-netto').textContent = fmt(h.netto);
    tr.querySelector('.c-cat').textContent = h.catatan;
    return h;
  }

  function ringkas() {
    const tot = { bruto: 0, dpp: 0, ppn: 0, pph: 0, netto: 0 };
    const per = {};
    rows.forEach(r => {
      const h = hitung(r);
      tot.bruto += num(r.bruto); tot.dpp += h.dpp; tot.ppn += h.ppn;
      tot.pph += h.nominal; tot.netto += h.netto;
      if (h.nominal) per[h.jenisPph] = (per[h.jenisPph] || 0) + h.nominal;
    });
    $('tfoot').innerHTML = `<tr><td colspan="5">Total</td><td class="n">${fmt(tot.bruto)}</td><td></td><td></td>
      <td class="n">${fmt(tot.dpp)}</td><td class="n">${fmt(tot.ppn)}</td><td></td><td></td>
      <td class="n">${fmt(tot.pph)}</td><td class="n">${fmt(tot.netto)}</td><td colspan="2"></td></tr>`;
    const items = Object.keys(per).map(j => `<li><strong>${esc(j)}</strong>: Rp${fmt(per[j])}</li>`);
    items.push(`<li><strong>PPN dipungut</strong>: Rp${fmt(tot.ppn)}</li>`);
    items.push(`<li><strong>TOTAL SETORAN PAJAK</strong>: Rp${fmt(tot.pph + tot.ppn)}</li>`);
    $('ringkasan').innerHTML = items.join('');
  }

  $('tbody').addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (!k) return;
    const i = +e.target.closest('tr').dataset.i;
    rows[i][k] = e.target.value;
    simpan();
    hitungBaris(i);
    ringkas();
  });
  $('tbody').addEventListener('change', e => {
    // jenis berubah: paksa PPN/hari yang tidak relevan, lalu render ulang
    if (e.target.dataset.k === 'jenis') {
      const i = +e.target.closest('tr').dataset.i;
      if (rows[i].jenis === JENIS[0] || rows[i].jenis === JENIS[1]) rows[i].termasukPpn = 'Tidak';
      if (rows[i].jenis !== JENIS[1]) rows[i].hari = '';
      simpan(); render();
    }
  });
  $('tbody').addEventListener('click', e => {
    if (!e.target.classList.contains('del')) return;
    rows.splice(+e.target.closest('tr').dataset.i, 1);
    if (!rows.length) rows.push(baru());
    simpan(); render();
  });
  $('tambah').addEventListener('click', () => { rows.push(baru()); simpan(); render(); });
  $('reset').addEventListener('click', () => {
    if (confirm('Hapus semua baris?')) { rows = [baru()]; simpan(); render(); }
  });
  $('csv').addEventListener('click', () => {
    const head = ['Tanggal', 'Uraian Transaksi', 'Nama Rekanan', 'Jenis Transaksi', 'Status NPWP / SBU',
      'Nilai Bruto / Kuitansi', 'Termasuk PPN?', 'Jml Hari (Tukang)', 'DPP', 'PPN (11%)',
      'Jenis PPh', 'Tarif PPh', 'Nominal PPh', 'Total Dibayar (Netto)'];
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = rows.map(r => {
      const h = hitung(r);
      return [r.tanggal, r.uraian, r.rekanan, r.jenis, r.npwp, num(r.bruto), r.termasukPpn, r.hari,
        h.dpp, h.ppn, h.jenisPph, pct(h.tarif), h.nominal, h.netto].map(q).join(',');
    });
    const blob = new Blob(['\ufeff' + [head.map(q).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'simulasi-pajak.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  render();
}
