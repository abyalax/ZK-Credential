# Kontrak server dan UI

Kontrak antara `web/` dan adapter HTTP tipis di `src/interfaces/http/` (tahap U1). Sumber kebenaran tipe di sisi UI:
`web/src/domain/` dan `web/src/application/ports/gateways.ts`. Bila berbeda dengan dokumen ini, ubah keduanya bersama.

## Prinsip

1. **Hasil `Result` bukan galat HTTP.** Penolakan protokol dan galat validasi domain adalah hasil normal: HTTP 200.
   Kode 4xx dipakai untuk permintaan yang rusak, 409 untuk run yang bentrok, 5xx untuk kegagalan infrastruktur.
2. **Amplop `Result`.** Endpoint yang memanggil use case dengan `Result<T, E>` membalas `{ "ok": true, "value": T }`
   atau `{ "ok": false, "error": E }`.
3. **Hanya data publik** yang keluar dari server lewat event dan log (lihat "Allowlist data publik").
4. **Tanpa autentikasi**, hanya `localhost`. State di server (in-memory atau `.zk-state/`), sehingga tab browser yang
   berbeda melihat state yang sama.
5. **Satu run pada satu waktu.** Run kedua ditolak dengan 409 `RUN_IN_PROGRESS`.
6. Nilai IPK selalu bilangan bulat dikali 100 (`350` = 3,50), sama dengan circuit.

## Tipe bersama

```ts
type ConfigurationId = 'A' | 'SD' | 'B1' | 'B2' | 'B3' | 'B4';
type VariantName = 'threshold' | 'issuer' | 'holder' | 'full'; // B1..B4

interface CredentialView {
  id: string;
  issuerId: string;
  holderPublicKey: string;
  studentNumber: string;
  fullName: string;
  degree: string;
  graduationDate: string; // YYYY-MM-DD
  gpa: number; // x100
  issuedAt: number; // epoch ms
}
interface IssuerView {
  id: string;
  name: string;
  publicKey: string;
  registered: boolean;
}
interface ChallengeView {
  value: string; // 62 hex (31 byte), kanonik
  verifierId: string;
  issuedAt: number;
  expiresAt: number;
  status: 'issued' | 'consumed' | 'expired';
}
interface PublicSignalsView {
  issuerPublicKey: string;
  gpaThreshold: number;
  challenge: string;
  verifierId: string;
}
interface ProofView {
  payload: string;
  publicSignals: PublicSignalsView;
  sizeBytes: number;
  durationMs: number;
}
interface Outcome {
  accepted: boolean;
  stage: 'prove' | 'verify';
  reason: string;
} // reason: 'ACCEPTED' | RejectionReason

interface Scenario {
  id: string;
  title: string;
  kind: 'honest' | 'attack';
  category: 'baseline' | 'threshold' | 'issuer' | 'holder' | 'replay' | 'malformed';
  openIn: VariantName[]; // varian yang membiarkan serangan lolos
  fullReason: string; // alasan penolakan pada B4
  applicableConfigurations: ConfigurationId[]; // konfigurasi yang bisa dijalankan server
}
```

`RejectionReason` = `CHALLENGE_UNKNOWN | CHALLENGE_VERIFIER_MISMATCH | CHALLENGE_ALREADY_USED | CHALLENGE_EXPIRED |
ISSUER_NOT_REGISTERED | THRESHOLD_BELOW_REQUIRED | PROOF_INVALID`, ditambah `PROVE_FAILED` (hasil tahap prove di
harness P5).

## Endpoint

Tanda **(+)** berarti tambahan terhadap sketsa di `ui-simulation.md`.

| Method dan path                         | Memanggil              | Body                                                       | Respons 200                                                          |
| --------------------------------------- | ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET  /api/issuer` **(+)**              | konfigurasi + registry | -                                                          | `IssuerView`                                                         |
| `GET  /api/issuer/credentials` **(+)**  | `CredentialRepository` | -                                                          | `CredentialView[]`                                                   |
| `POST /api/issuer/credentials`          | `makeIssueCredential`  | `{ studentNumber, fullName, degree, graduationDate, gpa }` | `Result<CredentialView, IssueCredentialError>`                       |
| `GET  /api/holder/credentials`          | `CredentialRepository` | -                                                          | `CredentialView[]`                                                   |
| `POST /api/holder/proofs`               | `makeGenerateProof`    | `{ credentialId, challenge, verifierId, threshold }`       | `Result<ProofView, CreateProofError>`                                |
| `GET  /api/verifier/challenges` **(+)** | `ChallengeStore`       | -                                                          | `ChallengeView[]` (terbaru dulu, status sudah dihitung dari `Clock`) |
| `POST /api/verifier/challenges`         | `makeIssueChallenge`   | `{ verifierId, ttlMs }`                                    | `ChallengeView`                                                      |
| `POST /api/verifier/verifications`      | `makeVerifyCredential` | `{ proof: ProofView, verifierId, requiredThreshold }`      | `Outcome & { durationMs }`                                           |
| `GET  /api/scenarios`                   | katalog serangan       | -                                                          | `Scenario[]` (22 serangan dan 4 honest)                              |
| `POST /api/runs`                        | orkestrator simulation       | `{ configuration, scenarioId }`                            | 202 `{ runId }`                                                      |
| `GET  /api/runs/:id/events`             | SSE                    | -                                                          | aliran event (bagian berikut)                                        |

Galat per endpoint:

- `IssueCredentialError` = `REQUIRED_FIELD_EMPTY | GPA_OUT_OF_RANGE | GRADUATION_DATE_INVALID | ISSUER_NOT_REGISTERED |
  SIGNER_KEY_MISMATCH` (dari `makeIssueCredential`).
- `CreateProofError` = `CREDENTIAL_NOT_FOUND | ATTRIBUTE_BELOW_THRESHOLD` (dari `makeGenerateProof`).
- `POST /api/runs`: 400 `SCENARIO_UNKNOWN`, 400 `SCENARIO_NOT_APPLICABLE` (konfigurasi tidak ada di
  `applicableConfigurations`), 409 `RUN_IN_PROGRESS`. Badan galat: `{ "error": "<KODE>" }`.
- `GET /api/runs/:id/events` untuk id tak dikenal: 404 `RUN_UNKNOWN`.

## SSE

`Content-Type: text/event-stream`. Dua jenis pesan:

```
data: {"runId":"r1","seq":0,"node":"issuer","step":"credential.issued","status":"completed","at":1790000000000,"data":{"credentialId":"c1"}}

event: run.completed
data: {"runId":"r1","configuration":"B4","scenarioId":"replay-same-proof","outcome":{"accepted":false,"stage":"verify","reason":"CHALLENGE_ALREADY_USED"},"totalMs":1830}
```

```ts
interface RunEvent {
  runId: string;
  seq: number; // urutan emisi; klien mengurutkan ulang
  node: 'issuer' | 'holder' | 'verifier' | 'contract';
  step: string; // katalog di bawah
  status: 'started' | 'completed' | 'rejected';
  at: number; // epoch ms dari port Clock
  durationMs?: number;
  data?: Record<string, string | number>; // hanya kunci pada allowlist
  reason?: string; // hanya pada status 'rejected'
}
interface RunSummary {
  runId: string;
  configuration: ConfigurationId;
  scenarioId: string;
  outcome: Outcome;
  totalMs: number;
}
```

Aturan aliran:

- Server menutup aliran setelah `run.completed`. Klien menutup `EventSource` saat menerimanya.
- Penolakan adalah akhir langkah, bukan akhir aliran: `run.completed` tetap dikirim dengan `outcome.accepted = false`.
- Klien yang tersambung terlambat menerima ulang event dari `seq = 0` (server menyimpan event run yang aktif atau
  terakhir). Klien membuang `seq` yang sudah pernah diterapkan.
- Putusnya koneksi sebelum `run.completed` dilaporkan UI sebagai `STREAM_INTERRUPTED`.

## Katalog event

| `step`                          | `node`                             | `status`                                                      | `data` yang boleh                                                                              |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `credential.issued`             | issuer                             | completed                                                     | `credentialId`, `issuerId`                                                                     |
| `challenge.issued`              | verifier                           | completed                                                     | `verifierId`, `challenge`, `expiresAt`                                                         |
| `witness.computed`              | holder                             | started, completed (+`durationMs`)                            | -                                                                                              |
| `proof.generated`               | holder                             | started, completed (+`durationMs`), rejected (`PROVE_FAILED`) | `proofBytes`                                                                                   |
| `presentation.sent`             | holder                             | completed                                                     | A/SD: `attributesRevealed`; B: `gpaThreshold`, `verifierId`, `challenge`, `attributesRevealed` |
| `preconditions.checked` **(+)** | verifier                           | completed, rejected                                           | -                                                                                              |
| `issuer.checked` **(+)**        | contract                           | completed, rejected                                           | `issuerId`, `issuerPublicKey`                                                                  |
| `proof.verified`                | contract (B1-B4), verifier (A, SD) | started, completed (+`durationMs`), rejected                  | completed pada B4: `gasUsed` bila ada hasil P6 (lihat "Gas referensi P6")                      |
| `challenge.consumed`            | verifier                           | completed                                                     | -                                                                                              |

Langkah per konfigurasi (alur sah):

| Konfigurasi | Langkah                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A           | `credential.issued`, `presentation.sent` (8 atribut), `proof.verified` (verifier)                                                                                                                 |
| SD          | `credential.issued`, `challenge.issued`, `presentation.sent` (1 atribut), `proof.verified` (verifier), `challenge.consumed`                                                                       |
| B1 - B4     | `credential.issued`, `challenge.issued`, `witness.computed`, `proof.generated`, `presentation.sent`, `preconditions.checked`, `issuer.checked`, `proof.verified` (contract), `challenge.consumed` |

Skenario dua tahap (`replay-same-proof`, `replay-relabelled-challenge`) menjalankan alur sah penuh dulu, lalu
`presentation.sent` dan rangkaian pemeriksaan sekali lagi. Pada B1-B3, `replay-relabelled-challenge` lolos di tahap kedua
(celah ablation), dan itu harus tampil sebagai "serangan lolos", bukan galat.

## Gas referensi P6

`gasUsed` pada `proof.verified` yang `completed` adalah **angka referensi dari benchmark P6**, bukan pengukuran run
itu: `estimateGas` untuk `CredentialVerifier.verifyCredential` dengan proof sah, dari
`experiments/results/<run>/gas/p6-benchmark.json`. `ui-simulation.md` mengharuskan gas ditampilkan dari hasil P6 dan tidak
dihitung ulang.

- Server membacanya sekali saat start dari run P6 terbaru yang `gas.status` = `measured`, dan mencetak
  `Gas reference (P6 run <id>): <angka>`. Tanpa run seperti itu server tetap jalan dan event tidak membawa `gasUsed`.
- Hanya B4 yang punya `CredentialVerifier` di P6, sehingga hanya B4 yang menampilkan gas. A, SD, dan B1-B3 tidak.
- Hanya verifikasi yang diterima membawa `gasUsed`. Penolakan di prasyarat atau di kontrak tidak, dan pada skenario dua
  tahap hanya tahap pertama (yang diterima) yang membawanya.
- UI menaruhnya di node Contract sebagai "Gas 251.374 · referensi P6" (bukan chip di edge, karena bukan payload).
  Teks "referensi P6" selalu menyertai angkanya.

## Pemetaan penolakan

| `reason`                      | Tahap  | Node menolak | Langkah                 |
| ----------------------------- | ------ | ------------ | ----------------------- |
| `PROVE_FAILED`                | prove  | holder       | `proof.generated`       |
| `CHALLENGE_VERIFIER_MISMATCH` | verify | verifier     | `preconditions.checked` |
| `THRESHOLD_BELOW_REQUIRED`    | verify | verifier     | `preconditions.checked` |
| `CHALLENGE_UNKNOWN`           | verify | verifier     | `preconditions.checked` |
| `CHALLENGE_EXPIRED`           | verify | verifier     | `preconditions.checked` |
| `CHALLENGE_ALREADY_USED`      | verify | verifier     | `preconditions.checked` |
| `ISSUER_NOT_REGISTERED`       | verify | contract     | `issuer.checked`        |
| `PROOF_INVALID`               | verify | contract     | `proof.verified`        |

Node `contract` mewakili `IssuerRegistry` dan `CredentialVerifier`. Fungsi `rejectingNode` di
`web/src/domain/verification.ts` dan tabel ini harus sama.

## Format rekaman

Rekaman adalah cadangan sidang bila simulation live bermasalah: aliran event dari run sungguhan yang disimpan ke berkas dan
diputar ulang oleh UI tanpa server (`?mode=replay`). Ditulis oleh `pnpm record:simulation`
(`scripts/record-simulation.ts`), dibaca oleh `web/src/domain/recording.ts`.

`<out>/<scenarioId>.<configuration>.json` (bawaan `web/public/recordings/`):

```ts
interface Recording {
  version: 1;
  recordedAt: string; // ISO 8601
  configuration: ConfigurationId;
  scenario: Scenario; // dari GET /api/scenarios saat merekam
  events: RunEvent[]; // persis yang dikirim aliran SSE, urut seq
  summary: RunSummary; // isi pesan run.completed
}
```

`<out>/index.json` mendaftar berkas, dan perekam menggabungkannya dengan yang sudah ada (entri skenario dan
konfigurasi yang sama diganti):

```ts
interface RecordingIndex {
  version: 1;
  recordings: { file: string; scenarioId: string; configuration: ConfigurationId; recordedAt: string }[];
}
```

Aturan:

- **Hanya run yang selesai.** Aliran yang berhenti sebelum `run.completed` (misalnya run crash) tidak direkam; perekam
  gagal dengan `RUN_INTERRUPTED`. Perekam menolak event dengan kunci di luar allowlist.
- **Validasi saat dimuat.** UI menolak rekaman dengan versi lain, tanpa `summary`, dengan `seq` tidak naik, dengan
  `runId` yang berbeda dari `summary.runId`, skenario yang tidak berlaku pada konfigurasinya, atau event berkunci non-publik.
  Satu berkas rusak menggagalkan seluruh pemuatan dan UI menyebut berkasnya, supaya cadangan tidak diam-diam
  kehilangan satu skenario.
- **Pemutaran.** Event diputar dengan jeda aslinya, dibatasi 250 ms sampai 1,5 detik, lalu `summary` direkam. `runId`
  diganti `replay-N`. Seperti server, satu putaran pada satu waktu. Tidak ada yang dihitung ulang, jadi gas, durasi, dan
  hasil sama dengan saat direkam.
- **Cakupan.** Hanya skenario dan konfigurasi yang direkam yang bisa dipilih. Halaman Issuer, Holder, dan Verifier tidak
  tersedia di mode ini karena membutuhkan server.
- UI selalu menampilkan "Rekaman cadangan, bukan simulation live" beserta tanggal rekaman terbaru.

## Allowlist data publik

Kunci yang boleh ada di `RunEvent.data`: `credentialId`, `issuerId`, `issuerPublicKey`, `verifierId`, `challenge`,
`expiresAt`, `gpaThreshold`, `attributesRevealed`, `proofBytes`, `publicSignals`, `gasUsed`.

Tidak boleh pernah: kunci privat holder atau issuer, `studentNumber`, `fullName`, `degree`, `graduationDate`, nilai
IPK kredensial, tanda tangan issuer, witness. Daftar kunci yang sama ada di `PUBLIC_DATA_KEYS`
(`web/src/domain/run-event.ts`); server harus punya tes yang menolak event dengan kunci di luar daftar.

Catatan: `GET /api/holder/credentials` dan `GET /api/issuer/credentials` memang membawa atribut kredensial. Itu isi
wallet holder dan daftar terbitan issuer di simulation lokal, bukan aliran event.

## Catatan sinkronisasi dengan ui-simulation.md

Bagian ini mencatat yang berbeda atau baru, untuk diputuskan saat D10 disetujui.

1. `reason` contoh `KEY_BINDING_INVALID` di `ui-simulation.md` tidak ada di `RejectionReason`. Serangan holder di P5
   berakhir `PROVE_FAILED`. Kontrak ini memakai nilai P5.
2. Dua langkah baru: `preconditions.checked` dan `issuer.checked`. Tanpa keduanya node `contract` tidak punya
   aktivitas sebelum verifikasi, dan penolakan prasyarat tidak punya langkah untuk dinyalakan merah.
3. Urutan event adalah urutan tampil, bukan urutan persis `evaluatePreconditions` (yang memeriksa verifier dan
   threshold, lalu issuer, lalu challenge). Node yang menolak tetap benar untuk tiap `reason`.
4. Pesan penutup `run.completed` dan `RunSummary` belum ada di sketsa; UI butuh akhir run yang tegas.
5. `Scenario.applicableConfigurations`: serangan hanya didefinisikan untuk circuit B1-B4. Padanan SD (dan A) menunggu
   keputusan titik desain 2 dan 3 di `ui-simulation.md`. Sampai itu ada, UI menonaktifkan serangan untuk A dan SD.
6. Tiga endpoint baca tambahan (ditandai **+**) agar halaman issuer dan verifier bisa menampilkan state tanpa
   menyimpannya di klien.

7. Galat permintaan memakai `{ "error": "INVALID_REQUEST", "detail": "..." }` (`detail` hanya petunjuk untuk manusia),
   `INVALID_JSON` untuk badan yang bukan JSON, `LOCALHOST_ONLY` (403) untuk hostname bukan lokal, dan 500
   `INFRASTRUCTURE_ERROR` atau `INTERNAL_ERROR` tanpa pesan galat.
8. Server saat ini hanya menjalankan B4, jadi `applicableConfigurations` berisi `["B4"]` untuk 21 skenario dan `[]` untuk
   lima lainnya. Rinciannya di [server.md](server.md).

## Tes kontrak

Sisi server (U1), dengan proof sungguhan di mesin biasa:

- Pemetaan `Result` ke amplop dan kode HTTP, termasuk 409 dan 400.
- Urutan dan isi event untuk tiap konfigurasi dan tiap `reason`, sesuai tabel di atas.
- Semua kunci `data` ada di allowlist.
- Hasil run sama dengan hasil P5 untuk replay, relabel, dan tanda tangan.

Sisi UI (sudah ada di `web/tests/`): reducer graf, playback langkah-per-langkah, 26 skenario mock terhadap ekspektasi
katalog, allowlist, validasi dan pemutaran rekaman, dan aturan lapisan. `web/tests/fixtures/recordings/` ditulis oleh
kode perekam asli terhadap server Express dengan engine tiruan; ia menjaga format yang dipakai bersama oleh perekam dan
validator (data uji, bukan run Groth16).
