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

Tanda **(+)** berarti tambahan terhadap sketsa di `ui-demo.md`.

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
| `POST /api/runs`                        | orkestrator demo       | `{ configuration, scenarioId }`                            | 202 `{ runId }`                                                      |
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
| `proof.verified`                | contract (B1-B4), verifier (A, SD) | started, completed (+`durationMs`), rejected                  | `gasUsed` bila ada hasil P6                                                                    |
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

## Allowlist data publik

Kunci yang boleh ada di `RunEvent.data`: `credentialId`, `issuerId`, `issuerPublicKey`, `verifierId`, `challenge`,
`expiresAt`, `gpaThreshold`, `attributesRevealed`, `proofBytes`, `publicSignals`, `gasUsed`.

Tidak boleh pernah: kunci privat holder atau issuer, `studentNumber`, `fullName`, `degree`, `graduationDate`, nilai
IPK kredensial, tanda tangan issuer, witness. Daftar kunci yang sama ada di `PUBLIC_DATA_KEYS`
(`web/src/domain/run-event.ts`); server harus punya tes yang menolak event dengan kunci di luar daftar.

Catatan: `GET /api/holder/credentials` dan `GET /api/issuer/credentials` memang membawa atribut kredensial. Itu isi
wallet holder dan daftar terbitan issuer di demo lokal, bukan aliran event.

## Catatan sinkronisasi dengan ui-demo.md

Bagian ini mencatat yang berbeda atau baru, untuk diputuskan saat D10 disetujui.

1. `reason` contoh `KEY_BINDING_INVALID` di `ui-demo.md` tidak ada di `RejectionReason`. Serangan holder di P5
   berakhir `PROVE_FAILED`. Kontrak ini memakai nilai P5.
2. Dua langkah baru: `preconditions.checked` dan `issuer.checked`. Tanpa keduanya node `contract` tidak punya
   aktivitas sebelum verifikasi, dan penolakan prasyarat tidak punya langkah untuk dinyalakan merah.
3. Urutan event adalah urutan tampil, bukan urutan persis `evaluatePreconditions` (yang memeriksa verifier dan
   threshold, lalu issuer, lalu challenge). Node yang menolak tetap benar untuk tiap `reason`.
4. Pesan penutup `run.completed` dan `RunSummary` belum ada di sketsa; UI butuh akhir run yang tegas.
5. `Scenario.applicableConfigurations`: serangan hanya didefinisikan untuk circuit B1-B4. Padanan SD (dan A) menunggu
   keputusan titik desain 2 dan 3 di `ui-demo.md`. Sampai itu ada, UI menonaktifkan serangan untuk A dan SD.
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
katalog, allowlist, dan aturan lapisan.
