# Panduan Pembuatan Aplikasi Android (APK) POS Resto

Folder `android-app` ini adalah ruang khusus untuk mengubah kode web kasir menjadi aplikasi Android sesungguhnya menggunakan Capacitor.js.

## Syarat Wajib Sebelum Memulai (Prerequisites)
Pastikan Anda sudah menginstal aplikasi berikut di komputer Windows Anda:
1. **Node.js** (Sudah terinstal, buktinya aplikasi web sudah berjalan).
2. **Android Studio**: Anda wajib mendownload dan menginstalnya dari [developer.android.com/studio](https://developer.android.com/studio).
3. Pastikan **Android SDK** sudah terkonfigurasi dengan benar di dalam Android Studio.

---

## Langkah 1: Sinkronisasi Kode Terbaru
Setiap kali Anda mengubah kode di dalam folder `frontend` (misalnya mengganti warna, atau menambah fitur Bluetooth), Anda **WAJIB** melakukan *Build* dan Sinkronisasi ulang agar file APK nantinya mendapatkan kode versi paling baru:

Buka Terminal/CMD, arahkan ke folder utama POS System, lalu jalankan:
```bash
# 1. Masuk ke folder frontend dan build versi web terbarunya
cd frontend
npm run build

# 2. Kembali ke folder android-app dan sinkronkan dengan Capacitor
cd ../android-app
npx cap sync android
```

---

## Langkah 2: Build & Menghasilkan File APK

### Cara A: Menggunakan Android Studio (Disarankan & Mudah)
1. Buka aplikasi **Android Studio**.
2. Pilih menu **Open Project** dan pilih folder `android` yang ada di dalam `android-app/android`.
3. Tunggu hingga proses sinkronisasi *Gradle* di pojok kanan bawah selesai.
4. Klik menu **Build** (di bar atas) -> pilih **Build Bundle(s) / APK(s)** -> klik **Build APK(s)**.
5. Setelah selesai, akan muncul notifikasi di pojok kanan bawah, klik **locate** untuk membuka lokasi file `.apk` Anda yang sudah jadi (biasanya bernama `app-debug.apk` atau `app-release.apk`).

### Cara B: Menggunakan Command Line (CLI)
Jika Anda tidak ingin membuka aplikasi Android Studio yang berat, Anda bisa menggunakan terminal (Pastikan *Environment Variables* Android SDK sudah di-set):
```bash
cd android-app/android
./gradlew assembleDebug
```
File APK akan muncul di: `android-app/android/app/build/outputs/apk/debug/app-debug.apk`

---

## Langkah 3: Mengunggah APK ke Halaman Pengaturan
1. Ubah nama file `app-debug.apk` atau `app-release.apk` hasil buatan Anda menjadi **`pos-resto.apk`**.
2. Pindahkan/Copy file tersebut ke dalam folder:
   `../backend/downloads/pos-resto.apk` (Timpa file *dummy* yang sudah ada).
3. Selamat! Karyawan Anda sekarang sudah bisa menekan tombol "Download APK" di halaman **Pengaturan** dan mereka akan menerima file buatan Anda sendiri.

---

## Catatan Tentang Plugin Printer Bluetooth Native
Jika Anda membutuhkan koneksi langsung ke printer thermal via Bluetooth Android (tanpa harus memunculkan dialog PDF), Anda harus menginstal Plugin Capacitor. Buka terminal di folder `android-app` dan jalankan:
```bash
npm install @capacitor-community/bluetooth-le
npx cap sync
```
Lalu Anda harus memodifikasi kode di `frontend/src/utils/printer.js` untuk memanggil plugin Bluetooth Native ini. Hubungi tim developer (saya) jika Anda sudah siap untuk mengintegrasikan bagian kode ini.
