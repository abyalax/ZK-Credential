# Draf Bab 4: Pembahasan

Pembahasan atas hasil P5 dan P6. Angka berasal dari `bab-implementasi-pengujian.md`
(`experiments/results/2026-11-22-212627/` untuk P5 B1-B4, `2026-11-22-081902/` untuk P6 B1-B4 dan A,
dan `2026-11-22-221212/` untuk P5 SD). Waktu SD-JWT belum diukur pada mesin penulis; lihat
catatan di Bagian 4.5.

## 4.5 Interpretasi ablation B1 → B4

**Keamanan naik per langkah.** Attack rejection rate naik dari 59,1% (B1) ke 72,7% (B2), 86,4% (B3),
dan 100% (B4). Setiap langkah menutup tepat tiga serangan yang ditargetkan mekanismenya: issuer
binding menutup manipulasi atribut, tanda tangan issuer lain, dan tanda tangan malformed; holder-key
binding menutup tiga skenario holder; dan binding challenge menutup tiga skenario relabel. Pola ini
sejalan dengan matriks hipotesis pada rencana (Bagian 8.2), dengan catatan bahwa angka B1-B3
mengikuti celah yang didaftarkan di katalog (`openIn`) dan dikonfirmasi oleh eksekusi proof nyata.

**Biaya tidak seragam.** Verifikasi tanda tangan EdDSA-Poseidon di dalam circuit menambah 9.834
constraint dan mengalikan waktu prove dan verify beberapa kali lipat dari B1 ke B2. Holder-key binding
hanya menambah 415 constraint (+4,2%) dan binding challenge 2 constraint. Jadi mekanisme yang paling
mahal justru yang paling mendasar, yaitu keaslian kredensial, sedangkan dua mekanisme berikutnya
murah dari sisi constraint.

**Selisih waktu B2 → B3 → B4 tidak boleh diartikan sebagai biaya mekanisme.** Standar deviasi B3
(448,1 ms) dan B4 (349,3 ms) besar, dan B4 tampak lebih cepat daripada B3 padahal hanya menambah 2
constraint. Median menunjukkan arah yang sama, sehingga selisih tersebut lebih mungkin berasal
dari variasi pengukuran daripada dari circuit. Biaya per mekanisme sebaiknya dibaca dari
jumlah constraint, yang deterministik, dan bukan dari waktu pada mesin yang tidak idle.

**Ukuran.** Ukuran proof Groth16 hampir konstan (sekitar 723 byte); payload tumbuh karena public signals
bertambah (757 byte pada B1 menjadi 920 byte pada B4).

## 4.6 Trade-off privasi dan biaya: A versus B4

Konfigurasi A memverifikasi lebih cepat (rerata 21,19 ms, tanpa waktu prove) daripada B4 (rerata prove
884,2 ms dan verify 546,87 ms) dan payload-nya lebih kecil (580 berbanding 920 byte), tetapi
verifier mengetahui seluruh atribut kredensial. B4 tidak membuka satu pun atribut dan menambahkan
jaminan holder dan replay yang tidak dimiliki A. Biaya privasi ini adalah tambahan sekitar 0,9 detik
waktu prove dan 0,5 detik waktu verify pada mesin penulis, ditambah 251.374 gas bila diverifikasi
on-chain (hasil `estimateGas` di Hardhat in-process, bukan transaksi di jaringan publik). Untuk satu
presentasi ijazah, biaya tersebut kecil dibandingkan nilai privasinya, tetapi bukan untuk verifikasi
bervolume tinggi.

## 4.7 Perbandingan dengan SD-JWT (D8, D9)

SD-JWT dengan key binding diimplementasikan sebagai pembanding non-ZKP (`SD` di repositori).

| Aspek                           | A (tanda tangan) | SD-JWT                           | B4 (usulan)             |
| ------------------------------- | ---------------- | -------------------------------- | ----------------------- |
| Atribut yang diketahui verifier | 8 (seluruhnya)   | 1 (IPK persis)                   | 0                       |
| Pembuktian predikat IPK ≥ τ     | tidak            | tidak; IPK dibuka lalu dicek     | ya, tanpa membuka nilai |
| Issuer authenticity             | ya               | ya                               | ya                      |
| Holder binding                  | tidak            | ya (kunci Ed25519 di `cnf`)      | ya (Poseidon)           |
| Replay protection               | tidak            | ya (`nonce` dan `aud` di KB-JWT) | ya (di circuit)         |
| Verification success rate (P5)  | 4/4              | 4/4                              | 4/4                     |
| Attack rejection rate (P5)      | belum diukur     | 16/16 (himpunan lebih kecil)     | 22/22                   |
| Ukuran proof / payload (B)      | 255 / 580        | 436 / 1.204                      | 725 / 920               |

Temuan utama: dari sisi keamanan terhadap katalog serangan, SD-JWT dengan key binding setara dengan B4
pada serangan yang berlaku, karena keduanya mengikat penerbit, pemegang, dan sesi. Perbedaannya adalah
privasi: SD-JWT dapat menyembunyikan atribut lain, tetapi untuk memenuhi kebijakan IPK ≥ τ holder harus
membuka nilai IPK, sedangkan B4 hanya membuka bahwa predikat terpenuhi. Dengan demikian keunggulan
zk-SNARK pada penelitian ini terletak pada predikat tanpa pengungkapan nilai, bukan pada kemampuan
menolak serangan yang sama.

Catatan penting: ukuran SD diambil dari harness P6 (`proofBytes` mencakup tanda tangan issuer dan
KB-JWT; `payloadBytes` seluruh presentasi) dan tidak bergantung pada perangkat keras. Waktu issue, present,
dan verify SD belum dimasukkan karena run P6 pada mesin penulis perlu diulang agar semua konfigurasi
diukur pada kondisi yang sama (`pnpm experiment:p6:nogas`; hasil tersimpan di
`experiments/results/<timestamp>/no-gas/`). Angka waktu dari sandbox tidak boleh dicampur dengan
angka mesin penulis.

Tingkat penolakan SD dihitung pada 16 serangan (15 padanan katalog dan satu khusus SD: IPK tidak
diungkap), sedangkan tujuh serangan khusus encoding ZK tidak berlaku pada SD-JWT
(`SD_NOT_APPLICABLE`). Perbandingan angka 16/16 dan 22/22 karenanya tidak sepadan, dan yang
dibandingkan adalah pola penolakan per kelas serangan.

## 4.8 Perbandingan dengan penelitian terdahulu

Pembanding: DIAR (2024), ZKBAR-V (2025), Cross-border Candidate Credential Verification (2025), dan
VeriZKP (2026). Isi tabel di bawah harus diambil dari PDF masing-masing dan setiap sel diberi
nomor section. Draf ini sengaja tidak mengisi sel dari ingatan, sehingga tidak ada klaim tentang
karya tersebut yang belum diverifikasi.

| Dimensi                                    | DIAR (2024) | ZKBAR-V (2025) | Cross-border (2025) | VeriZKP (2026) | Penelitian ini |
| ------------------------------------------ | ----------- | -------------- | ------------------- | -------------- | -------------- |
| Bukti predikat atribut tanpa membuka nilai | [PDF]       | [PDF]          | [PDF]               | [PDF]          | ya (IPK ≥ τ)   |
| Issuer signature binding di dalam proof    | [PDF]       | [PDF]          | [PDF]               | [PDF]          | ya             |
| Holder-key binding                         | [PDF]       | [PDF]          | [PDF]               | [PDF]          | ya             |
| Replay protection berbasis challenge       | [PDF]       | [PDF]          | [PDF]               | [PDF]          | ya             |
| Ablation per mekanisme                     | [PDF]       | [PDF]          | [PDF]               | [PDF]          | ya (B1-B4)     |
| Skenario serangan sistematis               | [PDF]       | [PDF]          | [PDF]               | [PDF]          | ya (22)        |
| Pembanding non-ZKP                         | [PDF]       | [PDF]          | [PDF]               | [PDF]          | ya (A, SD-JWT) |

Pengisian: unggah PDF keempat karya (atau kirim link-nya), lalu setiap sel diisi dengan temuan
penulis asli beserta sitasi bagian paper, misalnya (Section 3.1). Klaim bahwa suatu karya belum memiliki
mekanisme tertentu hanya boleh ditulis bila bagian paper yang menyatakannya dapat dikutip
(`docs/research/rq-evidence.md`, Bagian 9 rencana).
