# Simulasi Pajak & RAB

Aplikasi web statis (HTML, CSS, JavaScript) untuk simulasi PPN dan PPh (21, 22, 23, 4(2)) atas transaksi sekolah,
dengan input Bruto atau Netto (Gross-Up). Kolom dan pilihan dropdown mengikuti Google Sheets "Revit simulasi".

## Struktur

- `index.html` : halaman
- `style.css` : tampilan
- `app.js` : logika perhitungan (`hitung`, padanan `kalkulasiPajakRAB` di Code.gs) dan antarmuka

Tidak ada proses build. Data tersimpan di localStorage browser masing-masing.

## Deploy ke Vercel

Framework Preset: Other. Kosongkan Build Command dan Output Directory. Setiap perubahan di branch main terdeploy otomatis.

## Sinkronisasi dengan Code.gs

Jika aturan pajak di Code.gs berubah, ubah juga `hitungPph()`, `cariDppDariNetto()` dan `hitung()` di `app.js`.

Satu perbedaan disengaja: `isNPWP` di Code.gs lama memakai `includes('sbu')`, sehingga "Non-NPWP / Non-SBU"
ikut terbaca ber-NPWP. Di web, status dibaca persis dari pilihan dropdown. Perbaikan untuk Code.gs ada di file `Code.gs`
yang menyertai proyek ini.
