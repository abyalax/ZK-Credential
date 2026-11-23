# Draf Bab 1 dan Bab 5: batasan antarmuka, klaim kontribusi, dan batasan

Draf ini mengikuti dokumen "Rencana Skripsi" v1.5 (keputusan D1-D9). Kalimat ditulis impersonal dan
siap dipindahkan ke naskah.

## Bab 1: Batasan Masalah (tambahan)

### Batasan antarmuka (D4)

Sistem yang dibangun berupa pustaka inti, antarmuka baris perintah (CLI), dan test suite. Penelitian ini
tidak membangun API HTTP, basis data, maupun antarmuka web. React atau Next.js yang disebut pada
proposal awal tidak dikerjakan, karena klaim penelitian (keamanan dan biaya mekanisme zk-SNARK)
dapat dibuktikan sepenuhnya lewat CLI dan test suite. Penyimpanan challenge dan kredensial memakai
berkas JSON lokal di `.zk-state/` (CLI) atau memori (test dan benchmark) melalui antarmuka repository,
sehingga dapat diganti basis data pada pengembangan lanjutan tanpa mengubah lapisan inti.

### Batasan lain yang dicatat di Bab 1

- Credential revocation di luar cakupan sepenuhnya (D7).
- Data kredensial sintetis; satu predikat utama, yaitu IPK ≥ τ.
- Trusted setup Groth16 dilakukan lokal oleh satu kontributor dan tidak mewakili ceremony produksi.
- Blockchain berupa simulasi lokal (Hardhat); tidak ada deployment ke jaringan publik.
- Kolusi holder (berbagi private key) tidak dicegah, dan public signals tetap terlihat.
- Pembanding non-ZKP dibatasi pada SD-JWT (D9); BBS+ tidak diimplementasikan.

## Bab 1: Klaim Kontribusi

Kontribusi penelitian ini adalah integrasi tiga mekanisme dalam satu circuit zk-SNARK untuk
kredensial akademik, yaitu issuer signature binding, holder-key binding, dan challenge-based replay
protection, disertai evaluasi ablation dan pengujian serangan secara sistematis.

Yang tidak diklaim:

- Penelitian ini bukan primitif kriptografi baru dan bukan yang pertama menggabungkan tanda tangan
  EdDSA-Poseidon dengan challenge di dalam circuit; ekosistem iden3 dan Polygon ID serta karya seperti
  ZKCert sudah dekat dengan pendekatan ini.
- Credential revocation, unlinkability antar sesi, dan pencegahan holder yang sengaja membagikan
  private key tidak diklaim.

Klaim kontribusi dibuktikan lewat tiga hal yang masing-masing menunjuk ke bukti yang dapat dijalankan
ulang (`docs/research/rq-evidence.md`):

1. Ketiga mekanisme terikat dalam satu proof: varian circuit `full` (B4) memuat verifikasi tanda
   tangan, derivasi kunci holder, dan binding challenge serta verifier dalam satu statement Groth16
   (`docs/protocol/protocol.md`).
2. Setiap mekanisme menutup kelas serangan yang jelas: matriks serangan × konfigurasi dari 22 skenario
   (B1: 13 ditolak, B2: 16, B3: 19, B4: 22), dengan setiap celah B1-B3 terdaftar di katalog.
3. Biaya tambahan tiap mekanisme terukur: constraints, waktu prove dan verify, ukuran proof dan
   payload, memori, dan gas (B4).

## Bab 5: Kesimpulan (kerangka berbasis hasil)

Jawaban per rumusan masalah, dengan angka dari hasil P5 dan P6 (lihat
`bab-implementasi-pengujian.md` dan `bab-4-pembahasan.md`):

- **RQ1.** Verifier hanya mengetahui threshold, issuer, challenge, dan verifier; nilai IPK dan atribut
  lain tidak terungkap. Pada konfigurasi lain verifier mengetahui 8 atribut (A) atau IPK persis (SD).
- **RQ2.** Issuer binding menutup 3 serangan pada katalog (kredensial dimanipulasi, tanda tangan issuer
  lain, tanda tangan malformed) dan holder-key binding menutup 3 serangan holder; issuer yang tidak
  terdaftar ditolak pada tahap verifikasi domain.
- **RQ3.** Binding challenge dan verifier di circuit menutup 3 serangan relabel (B3 menerimanya, B4
  menolaknya), sedangkan reuse, wrong-verifier, expired, dan unknown ditolak oleh aturan challenge
  di domain pada semua konfigurasi.
- **RQ4.** Biaya terbesar berasal dari verifikasi tanda tangan di dalam circuit (B1 → B2: +9.834
  constraint). Holder binding menambah 415 constraint dan replay binding 2 constraint.
- **RQ5.** Attack rejection rate naik monoton B1 (59,1%) → B2 (72,7%) → B3 (86,4%) → B4 (100%)
  pada katalog 22 serangan. Selisih waktu antar langkah B2 → B3 → B4 tidak dapat dibaca sebagai biaya
  per mekanisme karena standar deviasi besar (lihat Bab 4 dan threats to validity).

Batasan penelitian (Bab 5): revocation di luar cakupan (D7); katalog serangan disusun penulis dan
tidak menjamin kelengkapan; trusted setup lokal; data sintetis; hasil kinerja terikat pada satu mesin
dan Node saja; alur challenge hybrid (off-chain) berbeda dari opsi D2 (registrasi on-chain).

Saran pengembangan: adapter Express dan penyimpanan basis data (menutup celah atomicity
`markConsumed` antar proses), ceremony ptau multi-kontributor, revocation, dan pembanding BBS+.
