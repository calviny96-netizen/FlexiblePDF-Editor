# FlexiblePDF-Editor

FlexiblePDF-Editor adalah aplikasi web ringan untuk membantu membuat dan mengelola dokumen PDF secara fleksibel.

## Persyaratan

- Node.js 18 atau lebih baru
- Browser modern (Chrome, Edge, Firefox, atau Safari)

## Instalasi

1. Clone repository:

   ```bash
   git clone https://github.com/calviny96-netizen/FlexiblePDF-Editor.git
   cd FlexiblePDF-Editor
   ```

2. Jalankan aplikasi:

   ```bash
   node server.js
   ```

   Alternatif di macOS/Linux:

   ```bash
   ./start.command
   ```

3. Buka alamat yang ditampilkan server di browser. Jika tidak ada pesan khusus, coba:

   ```text
   http://localhost:4310
   ```

## Struktur proyek

- `server.js` — server aplikasi lokal
- `public/` — antarmuka web, stylesheet, script, dan aset vendor
- `start.command` — shortcut untuk menjalankan aplikasi di macOS/Linux
- `CHANGELOG.md` — riwayat perubahan

## Versi

Versi saat ini: **FlexiblePDF-Editor V2.0**

## Tabel dan estimasi token

- Tabel panjang berlanjut otomatis per baris, dengan header dan proporsi kolom yang sama di halaman berikutnya. Pengukuran mengikuti ukuran dan margin halaman tujuan.
- Lebar kolom mengikuti `colgroup` sumber bila tersedia; tabel tanpa pengaturan lebar mendapat proporsi otomatis berdasarkan isi.
- Geser batas kolom pada header tabel di preview untuk mengubah lebar dua kolom bersebelahan. Klik dua kali untuk mengembalikan pengaturan awal. Lebar manual berlaku selama sesi dan direset ketika Markdown diedit.
- Baris atau blok tunggal yang lebih tinggi dari satu halaman diperkecil proporsional supaya seluruh isinya tetap terlihat.
- Estimasi token model China dinaikkan +200% (3×), model Amerika +800% (9×), setelah penyesuaian kelas model. Provider yang belum dipetakan memakai estimasi sebelumnya. Angka ini adalah estimasi aplikasi, bukan penggunaan token aktual dari API.

Pengujian token: `node tests/models.test.mjs`. Pengujian layout browser: jalankan isi `tests/pagination.browser.js` di konteks halaman aplikasi yang sudah terbuka; suite memeriksa batas halaman dan keutuhan urutan baris tanpa menyimpan isi laporan.


## Logo dan footer

Upload logo lewat **Logo dokumen**; gambar persegi maupun memanjang mengikuti proporsi aslinya dan otomatis muat di header. Tombol **Logo bawaan** mengembalikan logo awal. Upload diproses di browser.

Footer aplikasi default **off**. Aktifkan **Tampilkan footer** untuk menambahkan atribusi pada halaman terakhir. Teks footer yang ditulis sendiri di Markdown tetap menjadi bagian konten.

Field **Tokens** terisi otomatis; edit untuk memakai angka manual atau klik **Gunakan otomatis** untuk kembali ke estimasi model. Pengaturan dokumen berlaku selama sesi halaman.
