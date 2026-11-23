# Threats to validity (P6)

## Internal validity

- **Local powers of tau.** `pnpm setup:zk` runs a single-contributor ceremony. Proving and
  verification costs are representative, but the keys are not trustworthy. Research use only.
- **Challenge store is in-memory.** Replay protection is evaluated against a process-local store.
  Its cost is excluded from the benchmarks (verification time is pure cryptographic
  verification) and it does not survive restarts or scale across verifier instances.
- **Synthetic data.** Credentials are generated, with one numeric attribute (GPA). Real
  credentials with more attributes change the commitment size and the witness work.
- **Gas covers B4 only.** Only the proposed model has an on-chain verifier
  (`CredentialVerifier`); A and B1-B3 report no gas. The challenge check is off-chain and costs
  no gas. Gas is an `estimateGas` on in-process Hardhat, not a mined transaction on a public chain.
- **Baseline A is a minimal comparator.** It checks the issuer's EdDSA-Poseidon signature and
  the GPA policy in the clear, with full disclosure. It is not a complete credential format.

- **Katalog serangan disusun penulis.** Dua puluh dua serangan di `experiments/scenarios/catalog.ts`
  dipilih penulis berdasarkan threat model. Katalog ini tidak menjamin kelengkapan dan bukan bukti
  formal keamanan. Attack rejection rate 100% pada B4 hanya berlaku untuk serangan di katalog itu;
  serangan di luar katalog (misalnya side-channel, kolusi holder, kompromi trusted setup) tidak
  diuji dan berada di luar cakupan.
- **Attack rejection rate B1-B3 ditentukan oleh `openIn`.** Serangan yang diterima oleh B1-B3
  ditetapkan lebih dulu di katalog (`openIn`), bukan ditemukan oleh eksperimen. Test
  `tests/security/attack-scenarios.test.ts` memastikan hasil nyata (proof Groth16 sungguhan)
  sama dengan katalog, dan gagal bila ada serangan yang diterima di luar `openIn` atau ditolak di
  dalamnya. Jadi angka B1-B3 menunjukkan celah yang diprediksi dari rancangan dan dikonfirmasi
  oleh eksekusi, bukan celah yang ditemukan secara independen.
- **Ceremony ptau satu kontributor.** Tidak ada ceremony multi-kontributor. Siapa pun yang
  menjalankan `pnpm setup:zk` memegang seluruh toxic waste, sehingga kunci tidak dapat dipercaya
  untuk penggunaan produksi dan klaim soundness hanya berlaku di bawah asumsi setup jujur
  (sesuai Bagian 5 dan 6 rencana). Ceremony multi-kontributor (`snarkjs zkey contribute`
  beberapa kali dan beacon) tidak dikerjakan karena tidak mengubah klaim riset; ini dicatat
  sebagai batasan.
- **Pembanding SD-JWT adalah implementasi minimal.** Modul `src/infrastructure/sd-jwt/` memakai
  Ed25519 dan SHA-256 bawaan Node, mengikuti struktur SD-JWT dan key-binding JWT, tetapi bukan
  pustaka yang tersertifikasi dan tidak diuji interoperabilitasnya dengan implementasi lain.
  Serangan khusus encoding ZK (public signals dan elemen field) tidak berlaku pada SD-JWT dan
  dikeluarkan dari perbandingan (`SD_NOT_APPLICABLE`), jadi tingkat penolakan SD (16 dari 16)
  dihitung pada himpunan serangan yang lebih kecil daripada B1-B4 (22).
- **SD-JWT tidak membuktikan predikat.** Dengan SD-JWT verifier mengetahui nilai IPK persis. Selisih
  privasi ini adalah sifat format, bukan hasil pengukuran, dan tercermin pada
  `attributesRevealed` (A: 8, SD: 1, B1-B4: 0).
- **Perbedaan alur challenge.** Rencana (D2) memilih registrasi challenge on-chain, sedangkan
  implementasi memakai alur hybrid: challenge off-chain dan terikat ke proof di circuit, sementara
  registry issuer dan verifier Groth16 ada di kontrak. Skenario replay diuji di level domain dan
  circuit, bukan di level kontrak.

## Measurement validity

- **Memory is process peak RSS.** Each configuration runs in its own process, so `peakRssMb` is
  the peak of the whole run (setup, proving key load, proving, verifying), not per phase.
  `rssBeforeSetupMb` is reported to allow a rough delta.
- **Timing noise.** Wall-clock times on a shared machine. Warm-up runs absorb JIT and WASM
  compilation, but OS scheduling and thermal throttling remain; report mean, median and std, and
  prefer the median when std is large.
- **Prove time includes witness generation** (`snarkjs.groth16.fullProve`), not setup.
- **Statistik yang dilaporkan.** Harness melaporkan mean, median, dan standar deviasi. Rencana
  (Bagian 8.4) juga menyebut p95; p95 belum dihitung.
- **Waktu issue.** Harness mengukur `issue` (penandatanganan atau penerbitan) per konfigurasi
  di luar waktu prove. Pada A dan B1-B4 ini penandatanganan EdDSA-Poseidon, pada SD penerbitan SD-JWT.
- **Node only.** Browser and mobile performance are out of scope.

## External validity

- Results depend on the recorded hardware and tool versions (`environment` in
  `experiments/results/p6-benchmark.json`) and should not be generalised across machines.
- Groth16 on BN254 with circom/snarkjs only; other proof systems are not compared.

## CLI state (P7)

- The CLI keeps challenges and credentials in JSON files under `.zk-state/`. `markConsumed` is
  atomic inside one process only; two CLI processes verifying the same proof at the same instant
  could both pass. The in-memory store of the benchmarks and security tests does not have this gap.
- Credentials and the holder private key are stored unencrypted in the state directory.
