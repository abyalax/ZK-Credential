# Halaman, komponen, dan desain visual

Audiens utama: penguji sidang yang melihat layar proyektor. Pekerjaan utama UI: membuat orang paham siapa mengirim apa
ke siapa, dan di langkah mana sebuah serangan ditolak. Unsur yang dibuat paling menonjol adalah **blok hitam** (redaksi):
nilai yang tidak pernah meninggalkan holder tampil sebagai blok hitam, nilai yang terbuka tampil sebagai teks serif tebal.

## Navigasi

Routing hash tanpa pustaka tambahan, supaya simulation bisa disajikan sebagai halaman statis.

| Hash          | Halaman   | Mode                      |
| ------------- | --------- | ------------------------- |
| `#/simulator` | Simulator | Penjelasan (halaman awal) |
| `#/issuer`    | Issuer    | Coba sendiri              |
| `#/holder`    | Holder    | Coba sendiri              |
| `#/verifier`  | Verifier  | Coba sendiri              |

Peran dipilih lewat tombol di header, tanpa login. Tab yang berbeda dapat dibuka berdampingan untuk sidang.

## Role page

### Issuer

- **Terbitkan kredensial**: NIM, nama, gelar, tanggal lulus, IPK. Tombol "Terbitkan kredensial". Galat validasi tampil di
  bawah tombol dalam bahasa biasa (`ISSUE_ERROR_COPY`).
- **Profil issuer**: nama, ID, kunci publik (dipendekkan), lencana "Terdaftar" atau "Belum terdaftar" dari `IssuerRegistry`.
- **Kredensial yang diterbitkan**: daftar nama, NIM, IPK. Kosong: "Belum ada. Isi form di samping untuk menerbitkan
  kredensial pertama."

### Holder

- **Wallet**: daftar kredensial yang dapat dipilih. Kosong: arahan ke halaman Issuer.
- **Buat proof**: pilih challenge dari verifier (menampilkan sisa waktu), pilih threshold, tombol "Buat proof" dengan
  pewaktu berjalan selama proving. Hasil: durasi, ukuran, payload (dipendekkan), tombol "Kirim ke verifier" dan
  "Salin presentasi".
- **Yang dilihat verifier**: klaim "IPK pemegang kredensial ≥ X", daftar kredensial dengan seluruh atribut dihitamkan,
  serta verifier, challenge, dan issuer.

### Verifier

- **Kebijakan**: ID verifier, lencana konfigurasi (B4, model yang diusulkan), IPK minimum.
- **Challenge**: tombol "Buat challenge", daftar dengan hitung mundur dan status Dibuat, Dikonsumsi, Kedaluwarsa.
- **Presentasi dan hasil**: presentasi dari holder di tab ini masuk otomatis; dari tab lain ditempel sebagai JSON.
  Tombol "Periksa presentasi". Hasil: Diterima, atau "Ditolak: KODE" dengan penjelasan satu kalimat dan waktu periksa.

Menekan "Periksa presentasi" dua kali dengan presentasi yang sama harus menghasilkan `CHALLENGE_ALREADY_USED`. Ini
cara tercepat memperlihatkan replay protection tanpa membuka simulator.

## Simulator

Tata letak: baris kontrol, spanduk hasil, lalu graf (kiri) dan panel samping bertab (kanan, 24rem; di bawah graf pada
layar sempit).

```
┌ Konfigurasi ▾   Skenario ▾   [ ] Langkah per langkah        [Langkah berikutnya] [Jalankan] ┐
├ Spanduk hasil (muncul setelah run selesai) ─────────────────────────────────────────────────┤
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ Graf: Issuer, Holder, Verifier, Contract     │ Tab: Langkah | Yang diketahui verifier |      │
│ (React Flow, bentuk tetap)                   │      Bandingkan                               │
└──────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

| Bagian                      | Perilaku                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Konfigurasi                 | A, SD, B1-B4 dengan label penuh. Dikunci saat run berjalan. Mengganti konfigurasi mengembalikan skenario ke "Proof sah..." bila skenario lama tidak berlaku.                                                                                                                                                                  |
| Skenario                    | Dikelompokkan per kategori (Alur sah, Threshold, Issuer, Holder, Replay, Data rusak). Skenario yang tidak berlaku pada konfigurasi terpilih dinonaktifkan.                                                                                                                                                                    |
| Jalankan / Hentikan         | Satu tombol berganti. Menghentikan menampilkan event yang sudah diterima dan menutup aliran.                                                                                                                                                                                                                                  |
| Langkah per langkah         | Event ditahan, "Langkah berikutnya" menerapkan satu per satu. Dimatikan di tengah run: sisa event langsung diterapkan.                                                                                                                                                                                                        |
| Spanduk hasil               | Hijau "Diterima"; merah "Ditolak: KODE" dengan node dan langkah penolak, total waktu, dan apakah sesuai ekspektasi katalog. Serangan yang lolos pada B1-B3 tampil amber sebagai "Serangan lolos pada B*" dengan penjelasan celah ablation. Galat run (misalnya `RUN_IN_PROGRESS`) tampil sebagai spanduk merah dengan arahan. |
| Tab Langkah                 | Log event dengan nama langkah, node, durasi, alasan, dan lencana Mulai, Selesai, Ditolak.                                                                                                                                                                                                                                     |
| Tab Yang diketahui verifier | Jumlah atribut terbuka dari 8, kredensial contoh dengan blok hitam, dan tiga jaminan (keaslian issuer, terikat ke holder, tahan replay). A: 8, SD: IPK persis, B1-B4: 0.                                                                                                                                                      |
| Tab Bandingkan              | Menjalankan skenario terpilih pada B1 sampai B4 berurutan dan mengisi tabel Hasil dan Alasan satu baris demi satu baris. Hanya tersedia untuk skenario yang berlaku pada keempatnya.                                                                                                                                          |

Node: ikon peran, nama, keterangan satu baris, langkah terakhir dengan durasi, dan alasan penolakan beserta
penjelasannya bila merah. Edge: label payload dan chip nilai publik. Detail graf ada di
[architecture.md](architecture.md).

## Gas di node Contract

Setelah verifikasi yang diterima, node Contract menampilkan "Gas 251.374 · referensi P6" (angka bergantung pada hasil P6
terbaru). Ini angka `estimateGas` dari benchmark, bukan pengukuran run itu, dan hanya ada di B4. Tidak ada gas pada
konfigurasi lain, pada penolakan, atau bila server tidak menemukan run P6 dengan gas. Rincian:
[contract.md](contract.md#gas-referensi-p6).

## Mode rekaman

`?mode=replay` memutar ulang rekaman run sungguhan tanpa server, untuk dipakai bila simulation live bermasalah.

- Yang tampil sama dengan simulation live: graf, log, spanduk hasil, gas. Yang berbeda: hanya skenario dan konfigurasi yang
  direkam yang bisa dipilih, tab Bandingkan nonaktif, dan tombol Issuer, Holder, Verifier tidak ada (halaman itu
  membutuhkan server; membuka `#/issuer` tetap menampilkan Simulator).
- Banner amber "Rekaman cadangan, bukan simulation live" dengan tanggal rekaman terbaru selalu tampil, dengan tautan "Kembali ke
  server live".
- Di mode live ada tautan "Simulation live bermasalah? Buka rekaman cadangan" di dasar halaman, jadi peralihan satu klik.
- Bila rekaman belum ada atau rusak, layar "Simulation tidak bisa dimulai" menjelaskan cara merekam dan menawarkan mode live atau
  mock.

## Keadaan

| Keadaan         | Tampilan                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Belum ada data  | Kalimat yang menyebut tindakan berikutnya ("Isi form di samping...", "Minta dari halaman Verifier.") |
| Memuat          | Tombol berubah menjadi bentuk sedang-berjalan ("Menandatangani…", "Memeriksa…") dan dinonaktifkan    |
| Galat validasi  | Satu baris merah di bawah tombol yang menyebut apa yang salah dan cara memperbaikinya                |
| Galat server    | Pesan kode galat; tidak ada permintaan maaf                                                          |
| Aliran terputus | Spanduk "Run gagal" dengan `STREAM_INTERRUPTED`                                                      |
| Mode mock       | Banner kuning di dasar halaman, selalu tampil                                                        |
| Mode rekaman    | Banner amber \"Rekaman cadangan, bukan simulation live\" dengan tanggal rekaman                            |

Batasan simulation (proof di server, event hanya data publik, tanpa autentikasi, trusted setup lokal, satu simulasi sekali
waktu) tampil di dasar setiap halaman sebagai bagian yang dapat dibuka.

## Teks antarmuka

Bahasa Indonesia, kalimat biasa dengan huruf kapital hanya di awal. Istilah teknis (proof, challenge, threshold, issuer,
holder, verifier, replay) tidak diterjemahkan, sama dengan naskah skripsi. Tombol memakai kata kerja yang menyebut
akibatnya ("Terbitkan kredensial", "Buat proof", "Periksa presentasi"), dan satu aksi memakai nama yang sama dari tombol
sampai pesan hasilnya. Galat menyebut apa yang terjadi dan cara memperbaikinya.

## Aksesibilitas

- Fokus keyboard selalu terlihat (cincin fokus 2px, warna `--ring`).
- Semua kontrol dapat dicapai dengan keyboard; `Select`, `Tabs`, dan `Switch` memakai Radix.
- Status tidak hanya diwakili warna: node dan lencana juga memakai ikon dan teks (Diterima, Ditolak, Selesai).
- Blok hitam punya `aria-label="disembunyikan"`.
- Log event adalah `aria-live="polite"`.
- Animasi (denyut node, garis putus-putus) dimatikan oleh `prefers-reduced-motion`.
- Tata letak mengecil sampai layar ponsel; graf tetap terbaca karena `fitView`.

## Token desain

Didefinisikan di `web/src/app/styles.css`.

| Peran                | Nama            | Nilai     |
| -------------------- | --------------- | --------- |
| Teks, tombol utama   | Tinta           | `#14213D` |
| Latar                | Kertas          | `#F3F5F8` |
| Diterima             | Hijau segel     | `#1A6E50` |
| Ditolak              | Merah vermilion | `#B3342A` |
| Sedang berjalan      | Kobalt          | `#2D5BE3` |
| Menunggu, peringatan | Ambar           | `#8F5A00` |

Tipografi: Source Serif 4 untuk judul dan nilai kredensial (nilai yang terbuka tampil serif tebal), Schibsted Grotesk
untuk antarmuka, monospace sistem hanya untuk hash dan kode alasan. Rasio kontras teks terhadap latar dijaga di atas
4,5:1 untuk pasangan Tinta-Kertas dan pasangan lencana (teks berwarna pada latar `*-soft`).

## Belum tercakup

- Rekaman layar (video) sidang. Cadangan yang ada adalah rekaman event yang diputar ulang UI (lihat "Mode rekaman"); video
  layar harus dibuat manual.
- Rekaman run sungguhan itu sendiri: berkas di `web/public/recordings/` baru ada setelah `pnpm record:simulation` dijalankan
  terhadap server yang hidup.
- Padanan serangan untuk A dan SD (lihat catatan sinkronisasi nomor 5 di [contract.md](contract.md)).
