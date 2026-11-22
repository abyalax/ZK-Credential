# Draf Bab Implementasi dan Pengujian

Draf dari hasil P5 (skenario serangan) dan P6 (kinerja dan ablation). Angka P6 diambil dari
`experiments/results/2026-11-22-081902/gas/p6-table.md`. Angka hasil terukur P5 belum ada di repo:
jalankan `pnpm experiment:p5`, lalu isi tabel 4.2 dari `experiments/results/`.

## 4.1 Implementasi

Sistem dibangun dengan TypeScript, circuit Circom 2, Groth16 pada BN254 (snarkjs), dan kontrak Solidity
yang dijalankan di Hardhat lokal. Arsitektur memakai Modular Architecture dengan Functional Core dan
Imperative Shell (`docs/architecture/overview.md`). Spesifikasi statement, encoding, dan varian
circuit ada di `docs/protocol/protocol.md`.

Empat varian circuit membentuk tangga ablation: `threshold` (B1), `issuer` (B2), `holder` (B3), dan
`full` (B4, model usulan). Konfigurasi A adalah baseline tanda tangan digital tanpa ZKP dengan
pengungkapan penuh. Kredensial adalah komitmen Poseidon atas sembilan atribut, ditandatangani issuer
dengan EdDSA-Poseidon. Kunci holder diturunkan sebagai `Poseidon(holderPrivateKey)`. Challenge
berukuran 31 byte, terikat verifier, sekali pakai, dan disimpan off-chain (alur hybrid). Registry issuer
dan verifikasi Groth16 berjalan di kontrak `IssuerRegistry` dan `CredentialVerifier`.

Antarmuka berupa CLI (`keygen`, `register-issuer`, `issue`, `challenge`, `prove`, `verify`, `bench`)
dengan state di `.zk-state/` (`docs/command/cli.md`).

## 4.2 Pengujian keamanan (P5)

Katalog berisi 26 skenario: 4 honest dan 22 serangan, dalam kategori threshold, issuer, holder, replay,
dan malformed (`experiments/scenarios/catalog.ts`). Tiap skenario dijalankan pada B1-B4 dengan proof
Groth16 nyata. Setiap celah yang terbuka pada varian tertentu dicatat di katalog (`openIn`), dan
`tests/security/attack-scenarios.test.ts` gagal bila hasil menyimpang dari katalog.

Celah yang diharapkan menurut katalog (bukan hasil ukur):

| Konfigurasi | Serangan terbuka | Serangan ditolak | Attack rejection rate yang diharapkan |
| ----------- | ---------------- | ---------------- | ------------------------------------- |
| B1          | 9 dari 22        | 13               | 13/22 = 59,1%                         |
| B2          | 6 dari 22        | 16               | 16/22 = 72,7%                         |
| B3          | 3 dari 22        | 19               | 19/22 = 86,4%                         |
| B4          | 0 dari 22        | 22               | 22/22 = 100%                          |

Celah B1 adalah `credential-tampered`, `signature-other-issuer`, `signature-malformed`, tiga skenario
holder, dan tiga skenario replay yang berbasis relabel (`replay-relabelled-challenge`,
`relay-to-other-verifier`, `claims-challenge-out-of-field`). B2 menutup tiga yang pertama, B3 menutup
tiga skenario holder, dan B4 menutup tiga skenario replay.

Tabel terukur (verification success rate dan attack rejection rate per konfigurasi): TODO, isi dari
hasil `pnpm experiment:p5`.

## 4.3 Evaluasi kinerja (P6)

Protokol: 5 warm-up dan 30 pengukuran per konfigurasi, hanya di Node 22.23.5 pada Windows
(win32 10.0.26300, Intel Core i5-13420H, 23,7 GB RAM), circom 2.2.3, snarkjs 0.7.6.

| Config | Constraint | Prove ms (rerata ± std) | Verify ms (rerata ± std) | Proof B | Payload B | Peak RSS MB | Gas     |
| ------ | ---------- | ----------------------- | ------------------------ | ------- | --------- | ----------- | ------- |
| A      | -          | -                       | 21,19 ± 3,71             | 255     | 580       | 350,6       | -       |
| B1     | 62         | 48,1 ± 6,3              | 10,80 ± 1,75             | 723     | 757       | 448,4       | -       |
| B2     | 9.896      | 651,4 ± 85,3            | 474,98 ± 73,94           | 722     | 835       | 823,2       | -       |
| B3     | 10.311     | 1.173,3 ± 448,1         | 630,67 ± 130,39          | 723     | 836       | 849,2       | -       |
| B4     | 10.313     | 884,2 ± 349,3           | 546,87 ± 138,63          | 725     | 920       | 849,2       | 251.374 |

Overhead per langkah (rerata):

| Langkah | Δ constraint | Δ prove (ms) | Δ verify (ms) | Δ payload (B) |
| ------- | ------------ | ------------ | ------------- | ------------- |
| B1 → B2 | 9.834        | +603,3       | +464,19       | 78            |
| B2 → B3 | 415          | +521,9       | +155,68       | 1             |
| B3 → B4 | 2            | -289,2       | -83,80        | 84            |
| A → B4  | -            | +884,1       | +525,67       | 340           |

Pembahasan:

- Biaya terbesar datang dari verifikasi tanda tangan issuer di dalam circuit: 9.834 constraint, dan
  waktu prove serta verify naik beberapa kali lipat dari B1 ke B2.
- Holder binding menambah 415 constraint (+4,2%) dan replay binding hanya 2 constraint. Standar
  deviasi B3 (448,1 ms) dan B4 (349,3 ms) besar. B4 yang tampak lebih cepat dari B3 tidak bisa
  dijelaskan oleh circuit (hanya +2 constraint) dan kemungkinan berasal dari variasi pengukuran. Median
  prove (B3 1.216,7 ms, B4 734,4 ms) menunjukkan arah yang sama, jadi jangan klaim penghematan dan
  jangan baca selisih B2 → B3 → B4 sebagai biaya murni tiap mekanisme.
- Ukuran proof hampir sama di semua konfigurasi Groth16 (sekitar 723 byte). Payload tumbuh karena
  public signals bertambah.
- Konfigurasi A memverifikasi lebih cepat dari B2-B4 tetapi membuka seluruh atribut. Perbandingan A
  dengan B4 adalah pertukaran antara privasi dan biaya.
- Gas B4 sebesar 251.374 adalah `estimateGas` di Hardhat in-process, bukan transaksi yang di-mine di
  jaringan publik. Pengecekan challenge dilakukan off-chain sehingga tidak memakai gas.

## 4.4 Ancaman terhadap validitas

Ringkasan di `docs/research/threats-to-validity.md`: ceremony ptau lokal satu kontributor, challenge
store in-memory pada benchmark, data sintetis dengan satu atribut numerik, memori berupa peak RSS
seluruh proses, dan hasil terikat pada perangkat keras yang dicatat.
