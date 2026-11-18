// Simulasi Pajak & RAB: padanan kalkulasiPajakRAB() di Code.gs (Apps Script).
// Logika murni ada di hitung() (tanpa DOM) supaya bisa diuji.

const CFG = {
  PPN: 0.11,
  BATAS_TRANSAKSI: 2000000,  // PPN dan PPh 22 hanya jika DPP di atas ini
  BATAS_UPAH_HARIAN: 450000, // upah harian <= ini bebas PPh 21
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
const DASAR = ['Bruto', 'Netto (Gross-Up)'];
const YATIDAK = ['Tidak', 'Ya'];
const JENIS_PPH = ['PPh Pasal 21', 'PPh Pasal 22', 'PPh Pasal 23', 'PPh Pasal 4(2) Final'];

const num = v => {
  const n = Number(v);
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

function hitungPph(jenis, ber, dpp, jmlHari) {
  let jenisPph = '-', tarif = 0, nominal = 0;
  switch (jenis) {
    case JENIS[0]: {
      jenisPph = 'PPh Pasal 21';
      let p = pasal17(dpp * 0.5);
      if (!ber) p *= 1.2;
      nominal = Math.round(p);
      tarif = dpp > 0 ? nominal / dpp : 0;
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
      jenisPph = 'PPh Pasal 22';
      if (dpp > CFG.BATAS_TRANSAKSI) {
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
  return { jenisPph, tarif, nominal };
}

// Hitung mundur dari target netto rekanan ke DPP (pencarian biner, sama dengan Code.gs)
function cariDppDariNetto(jenis, ber, targetNetto, jmlHari) {
  if (targetNetto <= 0) return 0;
  if (jenis === JENIS[2] && targetNetto <= CFG.BATAS_TRANSAKSI) return targetNetto;
  if (jenis === JENIS[1] && targetNetto / jmlHari <= CFG.BATAS_UPAH_HARIAN) return targetNetto;

  let low = targetNetto;
  let high = Math.ceil(targetNetto * 1.6);
  let best = targetNetto;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const netto = mid - hitungPph(jenis, ber, mid, jmlHari).nominal;
    if (netto === targetNetto) {
      best = mid;
      high = mid - 1;
    } else if (netto < targetNetto) {
      low = mid + 1;
    } else {
      best = mid;
      high = mid - 1;
    }
  }
  return best;
}

// r: { jenis, npwp, dasar, nominal, termasukPpn, hari }
function hitung(r) {
  const kosong = { dpp: 0, ppn: 0, brutoRab: 0, jenisPph: '-', tarif: 0, nominal: 0, totalPajak: 0, netto: 0, catatan: '' };
  const nominalInput = num(r.nominal);
  if (!r.jenis || nominalInput <= 0) return kosong;

  // Catatan: Code.gs memakai includes('sbu') sehingga "Non-NPWP / Non-SBU" ikut terbaca ber-NPWP.
  // Di sini status dibaca persis dari pilihan dropdown.
  const ber = r.npwp === NPWP[0];
  const grossUp = String(r.dasar).toLowerCase().includes('netto');
  const inklusif = String(r.termasukPpn).toLowerCase() === 'ya';
  const jmlHari = Math.max(1, num(r.hari) || 1);
  const objekPpn = r.jenis === JENIS[2] || r.jenis === JENIS[3] || r.jenis === JENIS[4];
  const catatan = [];

  let dpp = nominalInput;
  if (grossUp) {
    dpp = cariDppDariNetto(r.jenis, ber, nominalInput, jmlHari);
  } else if (objekPpn && inklusif) {
    const est = Math.round(nominalInput / (1 + CFG.PPN));
    dpp = est > CFG.BATAS_TRANSAKSI ? est : nominalInput;
  }

  let ppn = 0;
  if (objekPpn && dpp > CFG.BATAS_TRANSAKSI) ppn = Math.round(dpp * CFG.PPN);
  else if (objekPpn) catatan.push('DPP <= Rp2.000.000: tanpa PPN.');

  const pph = hitungPph(r.jenis, ber, dpp, jmlHari);
  const brutoRab = dpp + ppn;
  const totalPajak = ppn + pph.nominal;
  const netto = brutoRab - totalPajak;

  if (r.jenis === JENIS[1] && !num(r.hari)) catatan.push('Jml Hari kosong dihitung 1 hari.');
  if (grossUp && netto !== nominalInput) catatan.push('Netto persis tidak bisa dicapai (batas tarif); DPP dibulatkan ke atas.');
  if (r.jenis === JENIS[3]) catatan.push('Sewa tanah/bangunan bukan PPh 23 (final 10%, PPh 4(2)).');

  return {
    dpp, ppn, brutoRab,
    jenisPph: pph.jenisPph, tarif: pph.tarif, nominal: pph.nominal,
    totalPajak, netto,
    catatan: catatan.join(' ')
  };
}

if (typeof module !== 'undefined') module.exports = { hitung, CFG, JENIS, NPWP, DASAR, YATIDAK, JENIS_PPH };

// ---------------- UI ----------------
if (typeof document !== 'undefined') {
  const KEY = 'simulasi-pajak-v2';
  const $ = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
  const pct = t => (t ? (t * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%' : '-');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const baru = () => ({
    tanggal: new Date().toISOString().slice(0, 10),
    uraian: '', rekanan: '',
    jenis: JENIS[2], npwp: NPWP[0],
    dasar: DASAR[0], nominal: '', termasukPpn: 'Tidak', hari: ''
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
        <td><select data-k="dasar">${opts(DASAR, r.dasar)}</select></td>
        <td><input type="number" min="0" data-k="nominal" value="${esc(r.nominal)}"></td>
        <td><select data-k="termasukPpn">${opts(YATIDAK, r.termasukPpn)}</select></td>
        <td><input type="number" min="0" data-k="hari" value="${esc(r.hari)}"></td>
        <td class="n c-dpp"></td><td class="n c-ppn"></td><td class="n c-rab strong"></td>
        <td class="c-jp"></td><td class="n c-tarif"></td>
        <td class="n c-pph"></td><td class="n c-tot"></td><td class="n c-netto strong2"></td>
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
    const objekPpn = r.jenis === JENIS[2] || r.jenis === JENIS[3] || r.jenis === JENIS[4];
    const grossUp = r.dasar === DASAR[1];
    tr.querySelector('[data-k=hari]').disabled = !upah;
    tr.querySelector('[data-k=termasukPpn]').disabled = !objekPpn || grossUp;
    tr.querySelector('.c-dpp').textContent = fmt(h.dpp);
    tr.querySelector('.c-ppn').textContent = fmt(h.ppn);
    tr.querySelector('.c-rab').textContent = fmt(h.brutoRab);
    tr.querySelector('.c-jp').textContent = h.jenisPph;
    tr.querySelector('.c-tarif').textContent = pct(h.tarif);
    tr.querySelector('.c-pph').textContent = fmt(h.nominal);
    tr.querySelector('.c-tot').textContent = fmt(h.totalPajak);
    tr.querySelector('.c-netto').textContent = fmt(h.netto);
    tr.querySelector('.c-cat').textContent = h.catatan;
  }

  function ringkas() {
    const tot = { dpp: 0, ppn: 0, rab: 0, pph: 0, pajak: 0, netto: 0 };
    const per = {};
    JENIS_PPH.forEach(j => { per[j] = { n: 0, dpp: 0, pajak: 0 }; });
    let nPpn = 0;
    let dppPpn = 0;

    rows.forEach(r => {
      const h = hitung(r);
      tot.dpp += h.dpp; tot.ppn += h.ppn; tot.rab += h.brutoRab;
      tot.pph += h.nominal; tot.pajak += h.totalPajak; tot.netto += h.netto;
      if (per[h.jenisPph]) {
        per[h.jenisPph].n += 1;
        per[h.jenisPph].dpp += h.dpp;
        per[h.jenisPph].pajak += h.nominal;
      }
      if (h.ppn > 0) { nPpn += 1; dppPpn += h.dpp; }
    });

    $('tfoot').innerHTML = `<tr><td colspan="9">Total</td>
      <td class="n">${fmt(tot.dpp)}</td><td class="n">${fmt(tot.ppn)}</td><td class="n">${fmt(tot.rab)}</td>
      <td></td><td></td>
      <td class="n">${fmt(tot.pph)}</td><td class="n">${fmt(tot.pajak)}</td><td class="n">${fmt(tot.netto)}</td>
      <td colspan="2"></td></tr>`;

    const sub = JENIS_PPH.reduce((a, j) => ({ n: a.n + per[j].n, dpp: a.dpp + per[j].dpp, pajak: a.pajak + per[j].pajak }), { n: 0, dpp: 0, pajak: 0 });
    const baris = JENIS_PPH.map(j => `<tr><td>${esc(j)}</td><td class="n">${per[j].n}</td><td class="n">${fmt(per[j].dpp)}</td><td class="n">${fmt(per[j].pajak)}</td></tr>`);
    baris.push(`<tr class="sub"><td>Subtotal PPh</td><td class="n">${sub.n}</td><td class="n">${fmt(sub.dpp)}</td><td class="n">${fmt(sub.pajak)}</td></tr>`);
    baris.push(`<tr><td>PPN Dipungut (11%)</td><td class="n">${nPpn}</td><td class="n">${fmt(dppPpn)}</td><td class="n">${fmt(tot.ppn)}</td></tr>`);
    baris.push(`<tr class="total"><td>TOTAL SETORAN PAJAK</td><td class="n">${sub.n + nPpn}</td><td class="n">-</td><td class="n">${fmt(sub.pajak + tot.ppn)}</td></tr>`);
    $('rekapPajak').innerHTML = baris.join('');

    const audit = tot.rab - tot.pajak - tot.netto;
    $('rekapRab').innerHTML = [
      ['Total Bruto Sebelum PPN (Total DPP)', tot.dpp, ''],
      ['Total PPN Dipungut (11%)', tot.ppn, ''],
      ['TOTAL BRUTO KESELURUHAN (PAGU RAB)', tot.rab, 'rab'],
      ['Total Potongan PPh (21, 22, 23, 4(2))', tot.pph, ''],
      ['Total Keseluruhan Pajak (PPN + PPh)', tot.pajak, ''],
      ['TOTAL NETTO KESELURUHAN (KE REKANAN)', tot.netto, 'netto'],
      ['Kontrol Audit (Bruto RAB - Pajak - Netto)', audit, audit === 0 ? 'audit' : 'audit-bad']
    ].map(([a, b, c]) => `<tr class="${c}"><td>${esc(a)}</td><td class="n">${fmt(b)}</td></tr>`).join('');
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
    const k = e.target.dataset.k;
    if (k !== 'jenis' && k !== 'dasar') return;
    const i = +e.target.closest('tr').dataset.i;
    const r = rows[i];
    if (r.jenis !== JENIS[1]) r.hari = '';
    simpan(); render();
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
    const head = ['Tanggal', 'Uraian / Item RAB', 'Nama Rekanan', 'Jenis Transaksi', 'Status NPWP / SBU',
      'Dasar Input', 'Nominal Input', 'Input Termasuk PPN?', 'Jml Hari (Tukang)',
      'Bruto Sebelum PPN (DPP)', 'PPN (11%)', 'Bruto Keseluruhan (Pagu RAB)',
      'Jenis PPh', 'Tarif PPh', 'Potongan PPh', 'Total Pajak (PPN + PPh)', 'Netto Diterima Rekanan'];
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = rows.map(r => {
      const h = hitung(r);
      return [r.tanggal, r.uraian, r.rekanan, r.jenis, r.npwp, r.dasar, num(r.nominal), r.termasukPpn, r.hari,
        h.dpp, h.ppn, h.brutoRab, h.jenisPph, pct(h.tarif), h.nominal, h.totalPajak, h.netto].map(q).join(',');
    });
    const blob = new Blob(['﻿' + [head.map(q).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'simulasi-pajak-rab.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  render();
}
