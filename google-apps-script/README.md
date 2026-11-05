# Memperbarui Google Apps Script

1. Buka proyek yang sudah digunakan aplikasi: https://script.google.com/home/projects/1un4X5sbWoPuGsoLBWvSQ3nmtzSKwT8emc5rxiM9_mBVLPpzmcH1Wu-Tt/edit
2. Simpan salinan kode lama untuk cadangan. Ganti seluruh isi berkas `Code.gs` di editor dengan isi `Code.gs` dari folder ini. Jangan menambahkan salinan fungsi yang sama pada berkas lain.
3. Klik **Save**, lalu **Deploy → Manage deployments → Edit (ikon pensil)** pada deployment Web App yang URL-nya digunakan aplikasi.
4. Pilih **Version → New version → Deploy**. Pertahankan URL dan pengaturan akses deployment yang sudah digunakan. Selesaikan otorisasi Google jika diminta.
5. Buka URL Web App `/exec` yang dipakai aplikasi dengan tambahan `?action=ping` (atau `&action=ping` jika URL sudah memiliki parameter). Respons yang diharapkan: `status: "success"`, `apiVersion: 3`, dan `serverMs` berupa angka.
6. Muat ulang aplikasi, uji daftar proyek, tarik proyek, lalu uji hapus hanya pada proyek percobaan yang memang boleh dihapus.

Gunakan URL deployment `/exec` untuk koneksi aplikasi, bukan tautan editor `/edit` atau URL uji `/dev`. Tidak perlu mengganti URL jika memperbarui deployment yang sama.

## Fitur

- Tes koneksi ringan, daftar ringkasan proyek, dan pengambilan satu proyek.
- Simpan, tarik berdasarkan jenis formulir, serta hapus ke Trash Drive.
- Cache daftar selama maksimal 60 detik; Refresh melewati cache. Simpan/hapus melalui skrip ini membatalkan cache server.
- Metadata ringkas untuk proyek yang disimpan melalui skrip terbaru. Berkas lama tetap bisa dibaca, tetapi pemuatan pertama dapat lebih lambat.
- Durasi pemrosesan server melalui `serverMs`. Angka ini tidak mencakup waktu mulai layanan Google, jaringan, atau pengalihan respons.

Kode ini menggunakan folder **Data Survei Lapangan** pada akun yang menjalankan deployment. Tidak memerlukan API key atau Advanced Drive Service.

Berkas ini sama dengan kode yang tersedia pada menu **Panduan & Salin Kode** aplikasi. Pengujian lokal memakai simulasi layanan Google; deployment dan kecepatan pada akun Google perlu diperiksa setelah pemasangan. Menjalankan `doGet` dari editor tanpa parameter akan membaca seluruh data; gunakan URL `?action=ping` untuk tes ringan.
