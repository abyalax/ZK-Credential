# Research question to evidence map

Setiap klaim skripsi menunjuk ke test atau eksperimen yang dapat dijalankan ulang. Perintah dijalankan
di mesin biasa (`pnpm setup:zk` lambat dan melewati batas waktu sandbox).

Nomor RQ mengikuti Bagian 4 dokumen "Rencana Skripsi" v1.5:

- **RQ1** rancangan verifikasi ijazah digital berbasis zk-SNARK tanpa membuka seluruh informasi (privasi)
- **RQ2** integrasi issuer signature binding dan holder-key binding dalam proof
- **RQ3** challenge-based replay protection
- **RQ4** performa (waktu proof, waktu verifikasi, ukuran proof, memori, constraints, gas)
- **RQ5** pengaruh tiap mekanisme terhadap keberhasilan pengujian serangan dan overhead komputasi

## Pemetaan konfigurasi: dokumen rencana vs repositori

Dokumen rencana memakai label A-D untuk ablation ZKP dan "Baseline 1" untuk tanda tangan tanpa ZKP.
Repositori memakai label lain karena `A` sudah dipakai oleh baseline tanda tangan.

| Dokumen rencana         | Repositori | Isi                                                |
| ----------------------- | ---------- | -------------------------------------------------- |
| Baseline 1              | A          | Tanda tangan digital tanpa ZKP, pengungkapan penuh |
| A (ZKP tanpa mekanisme) | B1         | Threshold IPK saja                                 |
| B (issuer)              | B2         | Threshold + issuer binding                         |
| C (issuer + holder)     | B3         | Threshold + issuer + holder-key binding            |
| D (Proposed)            | B4         | Threshold + issuer + holder + replay               |
| Baseline SD (D8, D9)    | SD         | SD-JWT dengan key binding, tanpa ZKP               |

Matriks S1-S9 di dokumen rencana adalah ringkasan 9 kelas serangan. Repositori mengujinya dalam 22
skenario serangan (`experiments/scenarios/catalog.ts`), dan SD-JWT diuji dengan 16 serangan padanannya
(`experiments/scenarios/sd-jwt.ts`; tujuh serangan khusus encoding ZK tidak berlaku dan dicatat di
`SD_NOT_APPLICABLE`).

## Peta bukti

| RQ  | Klaim yang didukung                                                        | Bukti (test atau eksperimen)                                                                                                                                                                                                                      | Perintah                                                |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| RQ1 | Verifier hanya mengetahui threshold, issuer, challenge, dan verifier       | Daftar public signals di `docs/protocol/protocol.md`; `tests/zk/proof-engine.test.ts`; private key holder tidak tercetak di `tests/e2e/cli-flow.test.ts`; perbandingan informasi yang diketahui verifier (`attributesRevealed`) pada A, SD, B1-B4 | `pnpm test:zk`, `pnpm test:e2e`                         |
| RQ2 | Hanya kredensial dari issuer terdaftar yang diterima                       | `tests/zk/issuer-proof.test.ts`; `tests/chain/credential-verifier.test.ts`; skenario `credential-tampered`, `signature-other-issuer`, `signature-malformed`, `issuer-unregistered`                                                                | `pnpm test:zk`, `pnpm chain:test`, `pnpm experiment:p5` |
| RQ2 | Salinan kredensial tanpa secret holder tidak dapat dipresentasikan         | `tests/zk/holder-proof.test.ts`; skenario `holder-without-key`, `holder-secret-guessed`, `holder-secret-out-of-field`                                                                                                                             | `pnpm test:zk`, `pnpm experiment:p5`                    |
| RQ3 | Proof tidak dapat dipakai ulang, direlay ke verifier lain, atau di-relabel | `tests/zk/replay-proof.test.ts`; `tests/security/replay-protection.test.ts`; skenario `replay-same-proof`, `replay-relabelled-challenge`, `relay-to-other-verifier`, `wrong-verifier`, `challenge-expired`, `challenge-unknown`                   | `pnpm test:security`, `pnpm experiment:p5`              |
| RQ4 | Prove time, verify time, ukuran proof, memori, constraints, gas            | `experiments/benchmarks/`; `experiments/results/2026-11-22-081902/gas/p6-table.md` dan `.csv`; run tanpa gas di `2026-11-22-081920/no-gas/`; konfigurasi SD ikut dalam run berikutnya (waktu issue, present, verify; ukuran payload)              | `pnpm experiment:p6`, `pnpm experiment:p6:nogas`        |
| RQ5 | Model usulan tidak menyisakan serangan terbuka; ablation menunjukkan celah | `tests/security/attack-scenarios.test.ts` (gagal bila ada serangan terbuka di `full` atau celah tak terdaftar); hasil di `experiments/results/` (verification success rate, attack rejection rate)                                                | `pnpm test:security`, `pnpm experiment:p5`              |
| RQ5 | Overhead tiap langkah B1 -> B2 -> B3 -> B4 dan terhadap baseline A dan SD  | `p6-overhead.csv` dan grafik SVG di folder yang sama; `experiments/configurations/`                                                                                                                                                               | `pnpm experiment:p6:analyze`                            |
| RQ5 | Perbandingan dengan pembanding non-ZKP (SD-JWT) pada keamanan dan privasi  | `tests/security/sd-jwt-scenarios.test.ts` (16 serangan ditolak, 4 honest diterima); `tests/unit/infrastructure/sd-jwt.test.ts`; hasil P5 SD di `experiments/results/2026-11-22-221212/scenarios/`                                                 | `pnpm test`, `pnpm experiment:p5 SD`                    |
| -   | Alur end to end berjalan lewat CLI pada chain lokal                        | `tests/e2e/cli-flow.test.ts` (diterima, replay exit code 2, menolak threshold di atas IPK)                                                                                                                                                        | `pnpm test:e2e`                                         |

Batasan yang mengkualifikasi klaim ini ada di [threats-to-validity.md](threats-to-validity.md).
