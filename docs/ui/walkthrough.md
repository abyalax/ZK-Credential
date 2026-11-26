# Panduan menjalankan simulation

Langkah demi langkah memakai UI `web/`, dari persiapan sampai simulator, beserta skenario dan aturan yang berlaku.
Isinya disusun dari [screens.md](screens.md) dan kode `web/src/features/`. Rujukan lain: [server.md](server.md) untuk
server simulation dan [contract.md](contract.md) untuk kontrak API.

## 1. Persiapan

**Mode mock** berjalan sepenuhnya di browser dengan event skrip, tanpa proof sungguhan. Semua 26 skenario aktif dan tab
Bandingkan bisa dipakai.

```bash
cd web && pnpm install && pnpm dev     # VITE_API_MODE=mock (bawaan)
```

**Mode http** memakai proof Groth16 sungguhan lewat server simulation, hanya untuk konfigurasi B4.

```bash
pnpm install
pnpm setup:zk full && pnpm chain:sync && pnpm chain:build

# terminal 1
pnpm chain:node
# terminal 2
pnpm generate:issuer-key         # salin ke .env bersama alamat kontrak dari chain:deploy
pnpm chain:deploy
pnpm cli register-issuer         # wajib, kalau tidak lencana issuer "Belum terdaftar"
# terminal 3
pnpm serve                       # http://127.0.0.1:8787, dokumentasi API di /api/docs
# terminal 4
cd web && cp .env.example .env   # ubah VITE_API_MODE=http
pnpm dev
```

## 2. Alur simulation

Urutannya tetap, karena tiap langkah butuh hasil langkah sebelumnya:

**Issuer → Verifier (buat challenge) → Holder → Verifier (periksa).**

### Halaman Issuer (`#/issuer`)

1. Cek profil di sisi kanan. Lencana harus **Terdaftar**.
2. Isi form (bawaan IPK 3,75), lalu klik **Terbitkan kredensial**.
3. Kredensial muncul di daftar "Kredensial yang diterbitkan" dan masuk wallet holder.

### Halaman Verifier (`#/verifier`), bagian challenge

4. Klik **Buat challenge**. Challenge muncul berstatus _Dibuat_ dengan hitung mundur 5 menit.
5. Atur **IPK minimum** kebijakan (bawaan 3,50). ID verifier tetap `verifier-a`.

### Halaman Holder (`#/holder`)

6. Di Wallet, pilih kredensial.
7. Pilih **Challenge dari verifier**. Hanya challenge berstatus _Dibuat_ yang muncul.
8. Pilih **Threshold IPK** (bawaan 3,50), lalu klik **Buat proof** dan tunggu pewaktu selesai.
9. Lihat durasi, ukuran, dan payload, serta panel "Yang dilihat verifier". Seluruh atribut dihitamkan, yang terbuka
   hanya klaim "IPK pemegang kredensial ≥ X".
10. Klik **Kirim ke verifier**. Untuk tab lain, klik **Salin presentasi**.

### Halaman Verifier, bagian periksa

11. Presentasi dari Holder di tab yang sama masuk otomatis. Dari tab lain, tempel JSON-nya.
12. Klik **Periksa presentasi**. Hasilnya _Diterima_, atau "Ditolak: KODE" dengan penjelasan satu kalimat dan waktu
    periksa.

### Memperagakan replay

13. Kotak presentasi dikosongkan setelah diperiksa. Untuk mengulang, kembali ke Holder, klik **Kirim ke verifier** lagi
    (atau tempel JSON hasil **Salin presentasi**), lalu **Periksa presentasi**. Hasil yang benar adalah
    `CHALLENGE_ALREADY_USED`. Pemeriksaan kedua dengan kotak kosong hanya menampilkan "Belum ada presentasi".

## 3. Simulator (`#/simulator`, halaman awal)

1. Pilih **Konfigurasi**: A, SD, atau B1 sampai B4. Pilihan dikunci selama run berjalan. B4 adalah model yang
   diusulkan, dan mode http hanya melayani B4.
2. Pilih **Skenario**. Daftar dikelompokkan per kategori, dan skenario yang tidak berlaku pada konfigurasi terpilih
   dinonaktifkan.
3. Nyalakan **Langkah per langkah** bila ingin menjelaskan sambil jalan, lalu tekan **Langkah berikutnya** untuk
   menerapkan event satu per satu. Bila dimatikan di tengah run, sisa event langsung diterapkan.
4. Klik **Jalankan**. Tombol berganti menjadi **Hentikan**.
5. Baca spanduk hasil. Hijau berarti _Diterima_. Merah berarti "Ditolak: KODE" dengan node dan langkah penolak, total
   waktu, dan kesesuaian dengan ekspektasi katalog. Amber ("Serangan lolos pada B\*") hanya muncul di B1 sampai B3
   sebagai celah ablation.
6. Panel kanan punya tiga tab:
   - **Langkah**: log event dengan durasi dan alasan. Setelah verifikasi yang diterima di B4, node Contract menampilkan
     "Gas N · referensi P6": angka `estimateGas` dari benchmark P6, bukan pengukuran run itu.
   - **Yang diketahui verifier**: jumlah atribut terbuka. A: 8, SD: IPK persis, B1 sampai B4: 0.
   - **Bandingkan**: menjalankan satu skenario pada B1 sampai B4 berurutan. Tombolnya nonaktif bila skenario tidak
     berlaku pada keempat konfigurasi.

## 4. Skenario dan hasil yang diharapkan pada B4

| Kategori   | Skenario                                                                                     | Hasil                         | Node penolak |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------------------- | ------------ |
| Alur sah   | proof sah, IPK sama dengan threshold, IPK 4,00, verifier kedua                               | Diterima                      | tidak ada    |
| Threshold  | IPK di bawah threshold (2,50 lawan 3,00)                                                     | `PROVE_FAILED`                | Holder       |
| Threshold  | klaim lebih lemah dari kebijakan                                                             | `THRESHOLD_BELOW_REQUIRED`    | Verifier     |
| Issuer\*   | kredensial diubah, tanda tangan issuer lain, tanda tangan rusak                              | `PROVE_FAILED`                | Holder       |
| Issuer\*   | issuer tidak terdaftar                                                                       | `ISSUER_NOT_REGISTERED`       | Contract     |
| Holder     | kunci penyerang, rahasia ditebak, rahasia di luar field                                      | `PROVE_FAILED`                | Holder       |
| Replay     | proof dipakai dua kali                                                                       | `CHALLENGE_ALREADY_USED`      | Verifier     |
| Replay     | proof dipindah ke challenge baru, atau ke verifier lain dengan label diganti                 | `PROOF_INVALID`               | Contract     |
| Replay     | proof sah dikirim ke verifier B tanpa diubah                                                 | `CHALLENGE_VERIFIER_MISMATCH` | Verifier     |
| Replay     | challenge kedaluwarsa                                                                        | `CHALLENGE_EXPIRED`           | Verifier     |
| Replay     | challenge yang tidak pernah diterbitkan                                                      | `CHALLENGE_UNKNOWN`           | Verifier     |
| Data rusak | bukan JSON, struktur salah, byte proof diubah, sinyal dipotong, bukan desimal, di luar field | `PROOF_INVALID`               | Contract     |

\*Skenario kategori Issuer dan `claims-challenge-out-of-field` (Data rusak) nonaktif di mode http. Keduanya hanya aktif
di mode mock. Alasannya ada di [server.md](server.md).

Untuk waktu sidang yang singkat, empat skenario sudah cukup: proof sah, replay, IPK di bawah threshold, dan proof
dipindah ke verifier lain. Keempatnya mewakili jaminan bukti sah, replay protection, ketidakmungkinan membuktikan hal
yang tidak benar, dan ikatan proof ke satu verifier.

## 5. Aturan yang berlaku

- **Issuer**: harus terdaftar di `IssuerRegistry`. NIM, nama, dan gelar wajib diisi. IPK 0,00 sampai 4,00. Tanggal lulus
  berformat `TTTT-BB-HH`.
- **Challenge**: sekali pakai, terikat ke satu verifier, dan berlaku 5 menit di halaman Verifier. Setelah dipakai
  statusnya _Dikonsumsi_, dan setelah lewat waktunya _Kedaluwarsa_.
- **Proof**: hanya bisa dibuat bila IPK kredensial lebih besar atau sama dengan threshold. Proof terikat ke satu
  challenge milik satu verifier. Pilihan threshold: 2,00, 2,50, 3,00, 3,50, 3,75.
- **Verifier**: menolak bila threshold klaim lebih rendah dari IPK minimum kebijakannya. Pada B4 ia tidak melihat satu pun
  atribut kredensial.
- **Simulator**: satu run pada satu waktu, run kedua mendapat `RUN_IN_PROGRESS`. Di mode http tiap run menerbitkan
  kredensial sungguhan yang ikut muncul di wallet.

## 6. Pemicu penolakan manual di halaman peran

| Cara                                                                 | Hasil                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| Terbitkan kredensial IPK 2,50, lalu buat proof dengan threshold 3,50 | pesan "IPK pada kredensial ini di bawah threshold"      |
| Threshold Holder 3,00, IPK minimum Verifier 3,50                     | `THRESHOLD_BELOW_REQUIRED`                              |
| Ubah satu karakter `payload` di JSON presentasi lalu tempel          | `PROOF_INVALID`                                         |
| Issuer belum didaftarkan                                             | gagal terbit dengan petunjuk `pnpm cli register-issuer` |
| Tunggu challenge lewat 5 menit                                       | status _Kedaluwarsa_, hilang dari pilihan Holder        |

## 7. Cadangan sidang (rekaman)

Siapkan sebelum sidang, di mesin yang akan dipakai, saat simulation live masih sehat:

1. Jalankan server (`pnpm serve`), lalu `pnpm record:simulation`. Bawaannya merekam `valid-accepted` dan `replay-same-proof`
   pada B4; tambah skenario dengan `--scenario=a,b`.
2. Periksa `web/public/recordings/` berisi `index.json` dan satu berkas per skenario, lalu commit.
3. Uji tanpa server: matikan `pnpm serve`, buka `http://localhost:5173/?mode=replay#/simulator`, jalankan kedua skenario.
   Banner amber "Rekaman cadangan, bukan simulation live" harus tampil.

Saat sidang, bila simulation live macet: klik "Buka rekaman cadangan" di dasar halaman, atau buka `?mode=replay`. Jelaskan
terus terang bahwa itu rekaman run sungguhan, bukan eksekusi saat itu. Rekam ulang setelah mengubah circuit, kontrak, atau
katalog, karena rekaman tidak ikut berubah. Video layar sebagai cadangan kedua tidak dibuat otomatis.

## 8. Batasan

- Di mode http, tab Bandingkan nonaktif karena server hanya melayani B4. Pakai mode mock untuk tabel perbandingan.
- ID verifier di halaman Verifier terkunci `verifier-a`, jadi skenario "verifier salah" hanya bisa diperagakan lewat
  Simulator.
- Kunci holder berada di server, dan event simulator hanya memuat data publik.
