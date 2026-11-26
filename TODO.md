## P0 - zk-SNARK Core

**P0.1 Toolchain spike**

- [x] `circom2` mengompilasi circuit kecil yang memakai circomlib
- [x] `snarkjs` dan `circomlibjs` bisa diimpor dari TS ESM (Node 22, TS 7); buat shim `.d.ts` bila perlu
- [x] Hardhat 3 jalan berdampingan dengan tsconfig repo (atau tsconfig terpisah di `contracts/`)
- [x] Pin semua versi dan update "Requirements" di README

**P0.2 Spesifikasi protokol dan encoding** (`docs/protocol/`)

- [x] Statement: "pemegang kredensial otentik dengan IPK ≥ threshold", beserta daftar input publik dan privat
- [x] Encoding atribut kredensial (string) ke field element BN254; GPA tetap integer ×100
- [x] Credential commitment = Poseidon(atribut, holderPublicKey), yang ditandatangani issuer
- [x] Encoding `issuerPublicKey` (BabyJubJub = 2 elemen), `verifierId`, dan `challenge` ke field element
- [x] Temuan: `Randomness.hex(32)` (256 bit) bisa melebihi ukuran field BN254 (~254 bit); challenge menggunakan 31 byte.

**P0.3 Circuit inti threshold IPK**

- [x] Template `GpaThreshold` di `circuits/src/`: range check 0..400 dan `GreaterEqThan(gpa, threshold)`
- [x] Circuit test: valid, di bawah threshold, dan di luar range
- [x] Catat jumlah constraint sebagai baseline ablation

**P0.4 Setup dan artifacts**

- [x] Script di `scripts/`: compile, powers of tau lokal, Groth16 setup, export verification key dan `Verifier.sol` ke `circuits/artifacts/` (gitignored)
- [x] Satu perintah idempoten, `pnpm setup:zk`
- [x] Dokumentasikan bahwa ptau lokal hanya untuk riset

**P0.5 ProofEngine adapter (snarkjs)**

- [x] Implementasi port `ProofEngine.generate/verify` di `infrastructure/proof-system/`
- [x] Domain tetap bebas package, sehingga `boundaries.test.ts` harus tetap hijau
- [x] Script `test:zk` terpisah agar `pnpm check` tetap cepat

## P1 - Issuer Authenticity

**P1.1 Key management dan signer**

- [x] Generate keypair EdDSA-Poseidon dan implementasi `CredentialSigner`; private key diprovisioning di luar git
- [x] Implementasi port `CredentialSigner` yang menandatangani commitment

**P1.2 Verifikasi tanda tangan di circuit**

- [x] Pakai `EdDSAPoseidonVerifier` circomlib; issuer key hash dan threshold menjadi input publik
- [x] Test: tanda tangan valid diterima. Atribut dimanipulasi, tanda tangan issuer lain, dan signature malformed ditolak.
- [x] Catat dampak constraint dan waktu (langkah ablation 1)

**P1.3 Integrasi domain**

- [x] Selaraskan `evaluateIssuerBinding` dan `PublicSignals` dengan encoding baru
- [x] Perbarui fakes dan test yang terdampak

**P1.4 Registry issuer on-chain**

- [x] Kontrak `IssuerRegistry.sol`: tambah issuer owner-only, `isTrusted`, dan event; tanpa revocation
- [x] Adapter `OnChainIssuerRegistry` untuk port dan jalur verifikasi melalui kontrak
- [x] Library chain viem hanya di `infrastructure/`

## P2 - Holder-Key Binding

**P2.1 Desain**

- [x] Konfirmasi derivasi `holderPublicKey` dan tulis alasannya di `docs/protocol/`
- [x] `holderPublicKey` masuk ke credential commitment

**P2.2 Circuit**

- [x] Constraint: prover mengetahui `holderPrivateKey` dengan `Poseidon(holderPrivateKey) == holderPublicKey`
- [x] Test: secret salah atau kredensial milik holder lain → witness gagal

**P2.3 Adapter dan security test**

- [x] Generate kunci holder; `HolderPrivateKey` tidak boleh ikut log atau output
- [x] Test: pemegang salinan kredensial tanpa private key tidak bisa membuat proof valid
- [x] Catat overhead (langkah ablation 2)

## P3 - Replay Protection

**P3.1 Binding challenge ke proof**

- [x] `challenge` dan `verifierId` menjadi input publik yang benar-benar terikat di circuit
- [x] Sesuaikan `makeIssueChallenge` dengan encoding dari P0.2

**P3.2 Alur hybrid**

- [x] Challenge tetap off-chain: pertahankan `ChallengeStore` dan aturan "konsumsi setelah proof valid"
- [x] Test: challenge pada public signals diubah → verifikasi kripto gagal, bukan hanya precondition domain

**P3.3 Security test dengan proof nyata**

- [x] Ulangi test replay yang ada (reuse, wrong verifier, expired, unknown, proof invalid tidak membakar challenge) dengan `ProofEngine` snarkjs
- [x] Tambah test race: dua verifikasi paralel atas proof yang sama, hanya satu berhasil
- [x] Catat overhead (langkah ablation 3)

## P4 - On-Chain Verifier dan Issuer Registry (Hardhat, local)

**P4.1 Setup Hardhat**

- [x] `contracts/` dengan Hardhat 3, jaringan lokal, semua jalan offline
- [x] Script `chain:node` dan `chain:deploy` (plus `chain:sync`, `chain:build`, `test:chain`)

**P4.2 Kontrak**

- [x] `Groth16Verifier.sol` hasil generate snarkjs (tidak diedit manual); disalin oleh `pnpm chain:sync` ke `contracts/src/generated/` (gitignored)
- [x] `IssuerRegistry.sol`: tambah issuer (owner-only), `isTrusted`, event; tanpa revocation. Kunci trust kini `issuerKeyHash = Poseidon(Ax, Ay)` agar cocok dengan public signal circuit
- [x] `CredentialVerifier.sol`: cek issuer terdaftar lalu verifikasi proof; urutan public signals harus cocok dengan circuit

**P4.3 Test kontrak**

- [x] Valid diterima; issuer tak terdaftar, proof atau signals dimanipulasi, dan non-owner yang mendaftarkan issuer ditolak. Test ada di `tests/chain/` (`pnpm test:chain`)

**P4.4 Adapter TypeScript**

- [x] `OnChainIssuerRegistry` (port `IssuerRegistry`) dan jalur verifikasi lewat kontrak (`createOnChainProofEngine`)
- [x] Library chain (viem/ethers) hanya di `infrastructure/` (dan `interfaces/composition/` sebagai composition root)

**P4.5 Composition root**

- [x] Wiring adapter nyata sesuai catatan di `overview.md`, konfigurasi lewat env lokal (`.env.example`, `interfaces/composition/`)

## P5 - Attack-Scenario Testing

**P5.1 Skenario** (`tests/security/` dan `experiments/scenarios/`)

- [x] Valid diterima; IPK di bawah threshold ditolak
- [x] Kredensial dimanipulasi, tanda tangan tidak valid, dan issuer tak terdaftar ditolak
- [x] Holder tanpa kunci gagal; replay, wrong-verifier, dan expired ditolak
- [x] Tambahan: public signals malformed dan input di luar field

**P5.2 Pengukuran**

- [x] Verification success rate dan attack rejection rate per konfigurasi, disimpan terstruktur (JSON/CSV) di `experiments/results/`

## P6 - Performance Evaluation dan Ablation

**P6.1 Konfigurasi** (`experiments/configurations/`)

- [x] A: verifikasi tanda tangan digital tanpa ZKP (baseline, full disclosure)
- [x] B: ZKP hanya threshold, lalu +issuer, +holder, +replay (= model usulan)
- [x] Satu varian circuit per konfigurasi di `circuits/src/variants/` (A tidak punya circuit; B1-B4 = `threshold`, `issuer`, `holder`, `full`)

**P6.2 Benchmark harness** (`experiments/benchmarks/`)

- [x] Metrik: waktu generate proof, waktu verifikasi, ukuran proof, memori, jumlah constraint, gas
- [x] Gas diukur lewat `estimateGas` pada kontrak; verifikasi challenge off-chain tidak punya biaya gas. Hanya B4 yang punya kontrak verifier, jadi gas hanya dilaporkan untuk B4. Perlu `pnpm chain:sync && pnpm chain:build` (butuh `solc`), jalankan di mesin biasa
- [x] Warm-up dan N pengulangan, laporan mean, median, std; catat spesifikasi hardware dan versi tool

**P6.3 Analisis**

- [x] Script olah hasil menjadi tabel dan grafik untuk RQ4 dan RQ5
- [x] Catat threats to validity: ptau lokal, challenge store in-memory, data sintetis

## P7 - CLI, Reproducibility, CI

- [x] Perintah CLI: `issue`, `challenge`, `prove`, `verify`, `bench` (plus `keygen` dan `register-issuer`); state di `.zk-state/` lewat file store
- [x] README: quickstart end-to-end satu skenario simulation
- [x] e2e test di `tests/e2e/` (`pnpm test:e2e`): CLI → chain lokal in-process → hasil. Belum dijalankan di sandbox karena `setup:zk` melewati batas waktu; jalankan di mesin biasa
- [x] GitHub Actions (`.github/workflows/ci.yml`): `pnpm check` dan job terpisah untuk test ZK
- [ ] Tag rilis untuk membekukan hasil eksperimen (manual: `git tag -a v0.1.0-results -m "P5/P6 results" && git push origin v0.1.0-results`)

## P8 - Dokumentasi dan Skripsi

- [x] Finalisasi `docs/protocol/`; update `overview.md` (catatan composition root sudah diganti, baris infrastructure dan interfaces diperbarui)
- [x] Petakan setiap RQ ke bukti (test atau eksperimen) di `docs/research/rq-evidence.md`. Nomor RQ1-RQ3 perlu diselaraskan dengan proposal
- [x] Draf Bab Implementasi dan Pengujian dari hasil P5 dan P6: `docs/research/bab-implementasi-pengujian.md`. Tabel P5 terukur sudah diisi dari `experiments/results/2026-11-22-212627/`

## P9 - Finalisasi Skripsi

Infrastruktur (API, database, frontend) tidak dibutuhkan untuk klaim riset. Cakupan tetap CLI + test suite (D4); hanya item bertanda "kondisional" yang dikerjakan bila diminta.

Prioritas tinggi:

- [x] Selaraskan RQ1-RQ5 dengan Bagian 4 rencana v1.5, lalu isi nomor RQ di kolom pertama `docs/research/rq-evidence.md` (plus pemetaan label konfigurasi rencana vs repositori)
- [x] Baseline SD-JWT (D8, D9): modul `src/infrastructure/sd-jwt/`, konfigurasi `SD` di `experiments/configurations/`, P5 di `experiments/scenarios/sd-jwt.ts` (16 serangan, 7 tidak berlaku) dan P6 (waktu issue, prove/present, verify; ukuran payload). Waktu SD pada mesin penulis perlu run `pnpm experiment:p6:nogas`
- [x] Tulis batasan antarmuka di Bab 1 (`docs/research/bab-1-5-kontribusi-batasan.md`): sistem berupa CLI dan test suite, tanpa API, database, atau frontend; sebut bahwa React/Next.js di proposal awal tidak dikerjakan (D4)
- [x] Tulis Bab 4 pembahasan (`docs/research/bab-4-pembahasan.md`; perbandingan dengan DIAR, ZKBAR-V, Cross-border, VeriZKP masih kerangka karena PDF belum dibaca): interpretasi ablation B1 -> B4, trade-off privasi vs biaya (A vs B4), dan perbandingan dengan DIAR, ZKBAR-V, Cross-border Candidate Credential Verification, VeriZKP
- [x] Tulis klaim kontribusi dan batasan di Bab 1 dan Bab 5 (`docs/research/bab-1-5-kontribusi-batasan.md`) sesuai rencana v1.5 (integrasi tiga mekanisme dalam satu circuit, evaluasi ablation dan serangan sistematis; revocation di luar cakupan, D7)

Prioritas sedang:

- [ ] Ulang P6 pada mesin idle (tutup aplikasi lain, daya tersambung) dan laporkan median; std B3 dan B4 besar sehingga selisih B2 -> B3 -> B4 tidak bisa dibaca sebagai biaya per mekanisme
- [x] Tambahkan ke `threats-to-validity.md`: katalog 22 serangan disusun penulis dan tidak menjamin kelengkapan (bukan bukti formal), serta hasil P5 hanya berlaku pada katalog itu
- [x] Tambahkan ke `threats-to-validity.md`: attack rejection rate B1-B3 ditentukan oleh `openIn` di katalog; jelaskan bahwa test `attack-scenarios.test.ts` memastikan hasil nyata sama dengan katalog
- [x] Pertimbangkan ceremony ptau multi-kontributor (dijelaskan sebagai batasan di `threats-to-validity.md`) agar klaim kunci tidak bisa dipertanyakan
- [ ] Tag rilis untuk membekukan hasil eksperimen (lihat item terbuka di P7)

Kondisional (hanya bila dosen atau penguji meminta simulation):

- [x] Adapter Express tipis di atas use case yang ada, store tetap lewat port (U1, lihat `docs/ui/server.md`; B4 saja, `pnpm test:e2e` dengan proof sungguhan belum dijalankan)
- [ ] Store berbasis database sebagai pengganti file store `.zk-state/` (juga menutup celah atomicity `markConsumed` antar-proses di `threats-to-validity.md`)
- [ ] Frontend minimal untuk simulation, hanya bila diminta secara eksplisit

Notes:

- [ ] EdDSA-Poseidon dengan syarat kompatibel dengan stack TypeScript, Hardhat, dan registry on-chain dengan challenge off-chain (hybrid).
- [ ] Hasil cek kompatibilitas: `circomlibjs` 0.1.7 dan `snarkjs` 0.7.6 sudah ESM dan cocok dengan `"type": "module"`. `@types/snarkjs` tersedia, sedangkan `circomlibjs` mungkin perlu shim `.d.ts`. Hardhat 3.22 ESM + TS native. Ini baru cek metadata npm, belum dijalankan, jadi P0.1 berisi spike untuk memastikannya (termasuk TypeScript 7 di repo ini).
- [ ] Compiler circom lewat paket npm `circom2` (WASM) agar tetap pnpm-only, dengan fallback ke binary native.
- [ ] Kunci holder berbentuk `holderPublicKey = Poseidon(holderPrivateKey)`, bukan perkalian BabyJubJub, karena lebih hemat constraint.
- [ ] Revocation tetap out of scope, sesuai `overview.md`.
- [ ] Fakes tetap dipakai untuk unit test cepat, sedangkan test proof nyata dipisah.
