# Panduan Deploy Cloudflare Worker AI (Gratis)

Worker ini berfungsi sebagai jembatan aman antara aplikasi survei di HP/Laptop dengan **Google Gemini AI**.
- **100% Gratis**: Kuota Cloudflare Worker 100.000 request/hari, Google Gemini 1.500 request/hari.
- **Petugas 0x Repot**: Petugas lapangan tidak perlu input API key di HP.

---

## Langkah 1: Dapatkan Gemini API Key (1 Menit)
1. Buka [aistudio.google.com](https://aistudio.google.com/) dan login dengan akun Google.
2. Klik tombol biru **"Get API key"** di pojok kiri atas.
3. Klik **"Create API key"** -> pilih project baru.
4. Salin (*copy*) kunci API yang muncul (contoh: `AIzaSyB...`).

---

## Langkah 2: Buat Cloudflare Worker (2 Menit)
1. Buka [dash.cloudflare.com](https://dash.cloudflare.com/) (buat akun gratis jika belum punya).
2. Di menu sebelah kiri, pilih **Workers & Pages** -> Klik tombol **"Create Application"** (atau **"Create Worker"**).
3. Beri nama worker Anda, misalnya: `survei-ai`.
4. Klik **"Deploy"**.
5. Setelah ter-deploy, klik tombol **"Edit code"**.
6. Hapus semua kode default di editor, lalu **Copy & Paste seluruh isi file `worker.js`** ke editor tersebut.
7. Klik tombol **"Deploy"** di pojok kanan atas.

---

## Langkah 3: Masukkan Gemini API Key sebagai Secret
1. Kembali ke halaman Worker Anda di Cloudflare dashboard (klik nama worker `survei-ai`).
2. Masuk ke tab **Settings** -> pilih submenu **Variables and Secrets**.
3. Di bagian *Secrets*, klik **"Add secret"** (atau *Add Variable*).
4. Isi:
   - **Variable name**: `GEMINI_API_KEY` *(Wajib huruf besar semua)*
   - **Value**: *Tempelkan API Key Google yang Anda salin di Langkah 1 tadi.*
5. Klik **"Save and Deploy"**.

---

## Langkah 4: Masukkan URL Worker ke Aplikasi
1. Di halaman Worker Cloudflare, salin URL worker Anda (formatnya seperti: `https://survei-ai.<subdomain>.workers.dev`).
2. Buka aplikasi survei (`index.html`, `udara.html`, atau `air.html`).
3. Ketuk tombol **✨ Asisten AI** -> pilih tab **⚙️ Pengaturan**.
4. Tempelkan URL worker Anda lalu klik **Simpan & Uji Koneksi**.
5. Selesai! Semua fitur AI (Proyeksi 24 Jam, Isi Form Otomatis, dan Chat AI) langsung aktif untuk semua pengguna.
