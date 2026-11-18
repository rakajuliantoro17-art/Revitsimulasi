/**
 * KONFIGURASI UTAMA
 */
const CONFIG = {
  NAMA_SHEET: 'Perhitungan Pajak',
  TARIF_PPN: 0.11,               // 11%
  BATAS_TRANSAKSI: 2000000,      // Rp 2.000.000 untuk PPh 22 & PPN
  BATAS_UPAH_HARIAN: 450000,     // Rp 450.000 bebas PPh 21 tukang
  KOLOM: {
    TANGGAL: 1,          // A
    URAIAN: 2,           // B
    REKANAN: 3,          // C
    JENIS: 4,            // D
    STATUS_NPWP: 5,      // E
    DASAR_INPUT: 6,      // F (Bruto / Netto (Gross-Up))
    NOMINAL_INPUT: 7,    // G
    TERMASUK_PPN: 8,     // H
    JML_HARI: 9,         // I
    DPP: 10,             // J (Bruto Sebelum PPN)
    PPN: 11,             // K (PPN 11%)
    BRUTO_RAB: 12,       // L (Bruto Keseluruhan / Pagu RAB)
    JENIS_PPH: 13,       // M
    TARIF_PPH: 14,       // N
    NOMINAL_PPH: 15,     // O (Potongan PPh)
    TOTAL_PAJAK: 16,     // P (PPN + PPh)
    NETTO: 17            // Q (Netto Diterima Rekanan)
  }
};

/**
 * Menu Kustom di Google Sheets
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🧮 Kalkulator Pajak & RAB')
    .addItem('1. Buat / Reset Template Lengkap (RAB)', 'buatTemplateSheet')
    .addItem('2. Pasang / Perbarui Panel Rekap RAB (Kolom S-V)', 'buatPanelRekapitulasi')
    .addItem('3. Hitung Ulang Semua Baris', 'hitungSemuaBaris')
    .addToUi();
}

/**
 * Trigger otomatis saat sel input (Kolom D - I) diedit
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.NAMA_SHEET) return;

  const startRow = e.range.getRow();
  const endRow = e.range.getLastRow();
  const col = e.range.getColumn();

  if (startRow < 2 || col < CONFIG.KOLOM.JENIS || col > CONFIG.KOLOM.JML_HARI) return;

  for (let row = startRow; row <= endRow; row++) {
    prosesBaris(sheet, row);
  }
}

/**
 * Menghitung satu baris transaksi & RAB
 */
function prosesBaris(sheet, row) {
  const k = CONFIG.KOLOM;
  const jenis = sheet.getRange(row, k.JENIS).getValue();
  const statusNpwp = sheet.getRange(row, k.STATUS_NPWP).getValue();
  const dasarInput = sheet.getRange(row, k.DASAR_INPUT).getValue() || 'Bruto';
  const nominalInput = Number(sheet.getRange(row, k.NOMINAL_INPUT).getValue()) || 0;
  const termasukPPN = sheet.getRange(row, k.TERMASUK_PPN).getValue() || 'Tidak';
  const jmlHari = Math.max(1, Number(sheet.getRange(row, k.JML_HARI).getValue()) || 1);

  if (!jenis || nominalInput <= 0) {
    sheet.getRange(row, k.DPP, 1, 8).clearContent();
    return;
  }

  const h = kalkulasiPajakRAB(jenis, statusNpwp, dasarInput, nominalInput, termasukPPN, jmlHari);

  sheet.getRange(row, k.DPP, 1, 8).setValues([[
    h.dpp,
    h.ppn,
    h.brutoRAB,
    h.jenisPPh,
    h.tarifPPh,
    h.nominalPPh,
    h.totalPajak,
    h.netto
  ]]);
}

/**
 * Mesin Perhitungan Lengkap (Mendukung Input Bruto maupun Netto Gross-Up)
 */
function kalkulasiPajakRAB(jenis, statusNpwp, dasarInput, nominalInput, termasukPPN, jmlHari) {
  // "Non-NPWP / Non-SBU" mengandung kata "sbu", jadi cek harus berdasarkan awalan "ber-"
  const isNPWP = String(statusNpwp).trim().toLowerCase().startsWith('ber-');
  const isGrossUp = String(dasarInput).toLowerCase().includes('netto');
  const isInklusifPPN = String(termasukPPN).toLowerCase() === 'ya';

  const isObjekPPN = (
    jenis === 'Pembelian Barang (PPh 22)' ||
    jenis === 'Pembelian Jasa / Sewa (PPh 23)' ||
    jenis === 'Jasa Konsultasi Konstruksi (PPh 4(2))'
  );

  let dpp = nominalInput;

  // Langkah 1: Tentukan DPP (Bruto Sebelum PPN)
  if (isGrossUp) {
    // Hitung mundur dari Target Netto Rekanan ke DPP
    dpp = cariDppDariNetto(jenis, isNPWP, nominalInput, jmlHari);
  } else {
    // Input berbasis Bruto
    if (isObjekPPN && isInklusifPPN) {
      const dppEstimasi = Math.round(nominalInput / (1 + CONFIG.TARIF_PPN));
      dpp = (dppEstimasi > CONFIG.BATAS_TRANSAKSI) ? dppEstimasi : nominalInput;
    } else {
      dpp = nominalInput;
    }
  }

  // Langkah 2: Hitung PPN (11% jika BKP/JKP dan DPP > 2 juta)
  let ppn = 0;
  if (isObjekPPN && dpp > CONFIG.BATAS_TRANSAKSI) {
    ppn = Math.round(dpp * CONFIG.TARIF_PPN);
  }

  // Langkah 3: Hitung PPh berdasarkan DPP
  const pphInfo = hitungPPhDariDpp(jenis, isNPWP, dpp, jmlHari);

  // Langkah 4: Susun Ringkasan Bruto RAB, Total Pajak, dan Netto
  const brutoRAB = dpp + ppn; // Total Pagu yang harus dianggarkan di RAB
  const totalPajak = ppn + pphInfo.nominalPPh; // Total PPN + PPh yang disetor ke negara
  const netto = brutoRAB - totalPajak; // Sama dengan (dpp - pphInfo.nominalPPh)

  return {
    dpp: dpp,
    ppn: ppn,
    brutoRAB: brutoRAB,
    jenisPPh: pphInfo.jenisPPh,
    tarifPPh: pphInfo.tarifPPh,
    nominalPPh: pphInfo.nominalPPh,
    totalPajak: totalPajak,
    netto: netto
  };
}

/**
 * Menghitung PPh berdasarkan DPP
 */
function hitungPPhDariDpp(jenis, isNPWP, dpp, jmlHari) {
  let jenisPPh = '-';
  let tarifPPh = 0;
  let nominalPPh = 0;

  switch (jenis) {
    case 'Honorarium Tenaga Ahli (PPh 21)':
      jenisPPh = 'PPh Pasal 21';
      const dppTenagaAhli = dpp * 0.50;
      let pphProgresif = hitungPasal17(dppTenagaAhli);
      if (!isNPWP) pphProgresif *= 1.20;
      nominalPPh = Math.round(pphProgresif);
      tarifPPh = dpp > 0 ? (nominalPPh / dpp) : 0;
      break;

    case 'Upah Tukang (PPh 21)':
      jenisPPh = 'PPh Pasal 21';
      const upahPerHari = dpp / jmlHari;
      if (upahPerHari <= CONFIG.BATAS_UPAH_HARIAN) {
        tarifPPh = 0;
        nominalPPh = 0;
      } else if (upahPerHari <= 2500000) {
        tarifPPh = 0.005;
        nominalPPh = Math.round(dpp * tarifPPh);
      } else {
        tarifPPh = 0.025;
        nominalPPh = Math.round(dpp * tarifPPh);
      }
      break;

    case 'Pembelian Barang (PPh 22)':
      jenisPPh = 'PPh Pasal 22';
      if (dpp > CONFIG.BATAS_TRANSAKSI) {
        tarifPPh = isNPWP ? 0.015 : 0.03;
        nominalPPh = Math.round(dpp * tarifPPh);
      } else {
        jenisPPh = 'Bebas PPh 22 (≤ 2 Jt)';
        tarifPPh = 0;
        nominalPPh = 0;
      }
      break;

    case 'Pembelian Jasa / Sewa (PPh 23)':
      jenisPPh = 'PPh Pasal 23';
      tarifPPh = isNPWP ? 0.02 : 0.04;
      nominalPPh = Math.round(dpp * tarifPPh);
      break;

    case 'Jasa Konsultasi Konstruksi (PPh 4(2))':
      jenisPPh = 'PPh Pasal 4(2) Final';
      tarifPPh = isNPWP ? 0.035 : 0.06;
      nominalPPh = Math.round(dpp * tarifPPh);
      break;
  }

  return { jenisPPh, tarifPPh, nominalPPh };
}

/**
 * Pencarian DPP presisi saat user menginput Target Netto (Gross-Up RAB)
 */
function cariDppDariNetto(jenis, isNPWP, targetNetto, jmlHari) {
  if (targetNetto <= 0) return 0;
  if (jenis === 'Pembelian Barang (PPh 22)' && targetNetto <= CONFIG.BATAS_TRANSAKSI) {
    return targetNetto;
  }
  if (jenis === 'Upah Tukang (PPh 21)' && (targetNetto / jmlHari) <= CONFIG.BATAS_UPAH_HARIAN) {
    return targetNetto;
  }

  let low = targetNetto;
  let high = Math.ceil(targetNetto * 1.6);
  let bestDpp = targetNetto;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const pph = hitungPPhDariDpp(jenis, isNPWP, mid, jmlHari).nominalPPh;
    const netto = mid - pph;
    if (netto === targetNetto) {
      bestDpp = mid;
      high = mid - 1;
    } else if (netto < targetNetto) {
      low = mid + 1;
    } else {
      bestDpp = mid;
      high = mid - 1;
    }
  }
  return bestDpp;
}

/**
 * Tarif Progresif Pasal 17 UU HPP untuk Tenaga Ahli
 */
function hitungPasal17(pkp) {
  let pajak = 0;
  let sisa = pkp;
  const lapisan = [
    { batas: 60000000, tarif: 0.05 },
    { batas: 190000000, tarif: 0.15 },
    { batas: 250000000, tarif: 0.25 },
    { batas: 4500000000, tarif: 0.30 },
    { batas: Infinity, tarif: 0.35 }
  ];

  for (const l of lapisan) {
    if (sisa <= 0) break;
    const kena = Math.min(sisa, l.batas);
    pajak += kena * l.tarif;
    sisa -= kena;
  }
  return pajak;
}

/**
 * Menghitung ulang seluruh baris transaksi
 */
function hitungSemuaBaris() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.NAMA_SHEET);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  for (let row = 2; row <= lastRow; row++) {
    prosesBaris(sheet, row);
  }
  SpreadsheetApp.getActiveSpreadsheet().toast('Semua baris RAB & Pajak berhasil dihitung ulang!', 'Selesai', 3);
}

/**
 * Membuat template tabel utama + panel rekapitulasi RAB
 */
function buatTemplateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.NAMA_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.NAMA_SHEET);
  } else {
    sheet.clear();
  }

  const headers = [
    'Tanggal', 'Uraian / Item RAB', 'Nama Rekanan', 'Jenis Transaksi',
    'Status NPWP / SBU', 'Dasar Input', 'Nominal Input', 'Input Termasuk PPN?', 'Jml Hari (Tukang)',
    'Bruto Sebelum PPN (DPP)', 'PPN (11%)', 'Bruto Keseluruhan (Pagu RAB)',
    'Jenis PPh', 'Tarif PPh', 'Potongan PPh', 'Total Pajak (PPN + PPh)', 'Netto Diterima Rekanan'
  ];

  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1e3a8a')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center')
    .setWrap(true);

  const maxBaris = 100;
  const ruleJenis = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'Honorarium Tenaga Ahli (PPh 21)',
      'Upah Tukang (PPh 21)',
      'Pembelian Barang (PPh 22)',
      'Pembelian Jasa / Sewa (PPh 23)',
      'Jasa Konsultasi Konstruksi (PPh 4(2))'
    ], true).build();

  const ruleStatus = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Ber-NPWP / SBU', 'Non-NPWP / Non-SBU'], true).build();

  const ruleDasar = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Bruto', 'Netto (Gross-Up)'], true).build();

  const rulePPN = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Tidak', 'Ya'], true).build();

  sheet.getRange(2, 4, maxBaris, 1).setDataValidation(ruleJenis);
  sheet.getRange(2, 5, maxBaris, 1).setDataValidation(ruleStatus);
  sheet.getRange(2, 6, maxBaris, 1).setDataValidation(ruleDasar);
  sheet.getRange(2, 8, maxBaris, 1).setDataValidation(rulePPN);

  // Format Angka Rupiah & Persentase
  sheet.getRange(2, 7, maxBaris, 1).setNumberFormat('#,##0');  // Nominal Input
  sheet.getRange(2, 10, maxBaris, 3).setNumberFormat('#,##0'); // DPP, PPN, Bruto RAB
  sheet.getRange(2, 14, maxBaris, 1).setNumberFormat('0.00%'); // Tarif PPh
  sheet.getRange(2, 15, maxBaris, 3).setNumberFormat('#,##0'); // PPh, Total Pajak, Netto

  // Warna latar pembeda kolom hasil
  sheet.getRange(2, 10, maxBaris, 8).setBackground('#f8fafc');
  sheet.getRange(2, 12, maxBaris, 1).setBackground('#eff6ff').setFontWeight('bold'); // Highlight Bruto RAB
  sheet.getRange(2, 17, maxBaris, 1).setBackground('#f0fdf4').setFontWeight('bold'); // Highlight Netto

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 38);
  sheet.autoResizeColumns(1, headers.length);

  buatPanelRekapitulasi();
}

/**
 * Panel Rekapitulasi Pajak & Keseluruhan Anggaran RAB di Kolom S - V
 */
function buatPanelRekapitulasi() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.NAMA_SHEET);
  if (!sheet) return;

  // Bersihkan area panel saja (S1:V20). Kolom P dan Q berisi data (Total Pajak, Netto), jangan disentuh.
  sheet.getRange('S1:V20').clear().breakApart();
  sheet.setColumnWidth(18, 25); // Kolom R sebagai pemisah

  // === BAGIAN A: REKAPITULASI PAJAK PER JENIS (Baris 1 - 9) ===
  sheet.getRange('S1:V1').merge()
    .setValue('📊 REKAPITULASI PAJAK PER JENIS')
    .setFontWeight('bold')
    .setBackground('#0f766e')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  sheet.getRange('S2:V2')
    .setValues([['Jenis Pajak', 'Jml Trx', 'Total DPP', 'Total Pajak']])
    .setFontWeight('bold')
    .setBackground('#ccfbf1')
    .setFontColor('#115e59')
    .setHorizontalAlignment('center');

  const barisRekapPajak = [
    ['PPh Pasal 21', '=COUNTIF($M$2:$M$1000, "PPh Pasal 21")', '=SUMIF($M$2:$M$1000, "PPh Pasal 21", $J$2:$J$1000)', '=SUMIF($M$2:$M$1000, "PPh Pasal 21", $O$2:$O$1000)'],
    ['PPh Pasal 22', '=COUNTIF($M$2:$M$1000, "PPh Pasal 22")', '=SUMIF($M$2:$M$1000, "PPh Pasal 22", $J$2:$J$1000)', '=SUMIF($M$2:$M$1000, "PPh Pasal 22", $O$2:$O$1000)'],
    ['PPh Pasal 23', '=COUNTIF($M$2:$M$1000, "PPh Pasal 23")', '=SUMIF($M$2:$M$1000, "PPh Pasal 23", $J$2:$J$1000)', '=SUMIF($M$2:$M$1000, "PPh Pasal 23", $O$2:$O$1000)'],
    ['PPh Pasal 4(2) Final', '=COUNTIF($M$2:$M$1000, "PPh Pasal 4(2) Final")', '=SUMIF($M$2:$M$1000, "PPh Pasal 4(2) Final", $J$2:$J$1000)', '=SUMIF($M$2:$M$1000, "PPh Pasal 4(2) Final", $O$2:$O$1000)'],
    ['Subtotal PPh', '=SUM(T3:T6)', '=SUM(U3:U6)', '=SUM(V3:V6)'],
    ['PPN Dipungut (11%)', '=COUNTIF($K$2:$K$1000, ">0")', '=SUMIF($K$2:$K$1000, ">0", $J$2:$J$1000)', '=SUM($K$2:$K$1000)'],
    ['TOTAL SETORAN PAJAK', '=T7+T8', '-', '=V7+V8']
  ];

  sheet.getRange('S3:V9').setValues(barisRekapPajak);
  sheet.getRange('S2:V9').setBorder(true, true, true, true, true, true, '#94a3b8', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange('S7:V7').setFontWeight('bold').setBackground('#f1f5f9');
  sheet.getRange('S9:V9').setFontWeight('bold').setBackground('#fef3c7').setFontColor('#92400e');
  sheet.getRange('T3:T9').setHorizontalAlignment('center').setNumberFormat('#,##0');
  sheet.getRange('U3:V9').setNumberFormat('#,##0');
  sheet.getRange('U9').setHorizontalAlignment('center');

  // === BAGIAN B: REKAPITULASI ANGGARAN RAB KESELURUHAN (Baris 11 - 18) ===
  sheet.getRange('S11:V11').merge()
    .setValue('📋 REKAPITULASI ANGGARAN RAB (KESELURUHAN)')
    .setFontWeight('bold')
    .setBackground('#1e3a8a')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  const barisRekapRAB = [
    ['Total Bruto Sebelum PPN (Total DPP)', '=SUM($J$2:$J$1000)'],
    ['Total PPN Dipungut (11%)', '=SUM($K$2:$K$1000)'],
    ['TOTAL BRUTO KESELURUHAN (PAGU RAB)', '=SUM($L$2:$L$1000)'],
    ['Total Potongan PPh (21, 22, 23, 4(2))', '=SUM($O$2:$O$1000)'],
    ['Total Keseluruhan Pajak (PPN + PPh)', '=SUM($P$2:$P$1000)'],
    ['TOTAL NETTO KESELURUHAN (KE REKANAN)', '=SUM($Q$2:$Q$1000)'],
    ['Kontrol Audit (Bruto RAB - Pajak - Netto)', '=V14-V16-V17']
  ];

  for (let i = 0; i < barisRekapRAB.length; i++) {
    const r = 12 + i;
    sheet.getRange(r, 19, 1, 3).merge().setValue(barisRekapRAB[i][0]);
    sheet.getRange(r, 22).setFormula(barisRekapRAB[i][1]);
  }

  sheet.getRange('S12:V18')
    .setBorder(true, true, true, true, true, true, '#94a3b8', SpreadsheetApp.BorderStyle.SOLID)
    .setBackground('#f8fafc');
  sheet.getRange('S14:V14').setFontWeight('bold').setBackground('#dbeafe').setFontColor('#1e40af'); // Pagu RAB
  sheet.getRange('S17:V17').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#166534'); // Netto Keseluruhan
  sheet.getRange('S18:V18').setFontStyle('italic').setFontColor('#64748b');
  sheet.getRange('V12:V18').setNumberFormat('#,##0');

  sheet.setColumnWidth(19, 185); // S
  sheet.setColumnWidth(20, 70);  // T
  sheet.setColumnWidth(21, 130); // U
  sheet.setColumnWidth(22, 140); // V

  ss.toast('Template & Panel Rekapitulasi RAB siap digunakan!', 'Selesai', 3);
}

/**
 * RUMUS KUSTOM (Opsional)
 */
function HITUNG_PAJAK_RAB(jenis, statusNpwp, dasarInput, nominalInput, termasukPPN, jmlHari) {
  if (!jenis || !nominalInput) return [['', '', '', '', '', '', '', '']];
  const h = kalkulasiPajakRAB(
    jenis,
    statusNpwp || 'Ber-NPWP',
    dasarInput || 'Bruto',
    Number(nominalInput),
    termasukPPN || 'Tidak',
    Number(jmlHari) || 1
  );
  return [[h.dpp, h.ppn, h.brutoRAB, h.jenisPPh, h.tarifPPh, h.nominalPPh, h.totalPajak, h.netto]];
}