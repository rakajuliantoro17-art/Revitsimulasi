# Simulasi Perhitungan Pajak

Aplikasi web statis (HTML, CSS, JavaScript) untuk simulasi PPN dan PPh (21, 22, 23, 4(2)) atas transaksi sekolah. Kolom dan pilihan dropdown mengikuti spreadsheet "Revit simulasi".

## Struktur

- `index.html` : halaman
- `style.css` : tampilan
- `app.js` : logika perhitungan (fungsi `hitung`) dan antarmuka

Tidak ada proses build. Data tersimpan di localStorage browser masing-masing.

## Deploy ke Vercel

1. Import repo ini di Vercel.
2. Framework Preset: Other. Kosongkan Build Command dan Output Directory.
3. Deploy.

## Mengubah tarif

Semua konstanta ada di objek `CFG` dan di `switch` pada fungsi `hitung` di `app.js`.

## Catatan sinkronisasi dengan Code.gs

`hitung()` di `app.js` adalah padanan `kalkulasiPajak()` di Code.gs. Satu perbedaan disengaja: di Code.gs,
`isNPWP` memakai `includes('sbu')`, sehingga pilihan "Non-NPWP / Non-SBU" ikut terbaca sebagai ber-NPWP
(karena mengandung kata "sbu"). Di aplikasi web status dibaca persis dari pilihan dropdown. Perbaikan di Code.gs:

```js
const isNPWP = String(statusNpwp).trim().toLowerCase().startsWith('ber-');
```
