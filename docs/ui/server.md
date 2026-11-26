# Server simulation (adapter Express, tahap U1)

Adapter HTTP tipis di `src/interfaces/http/` yang memenuhi [contract.md](contract.md). Ia memetakan permintaan ke use case
yang sama dengan CLI dan memetakan `Result` ke respons. Aturan protokol tetap di `domain/` dan `application/`.

## Menjalankan

Prasyarat sama dengan CLI: artefak `pnpm setup:zk`, chain lokal (`pnpm chain:node`, `pnpm chain:deploy`), dan `.env`
berisi alamat kontrak serta `ISSUER_PRIVATE_KEY`. Issuer harus terdaftar (`pnpm cli register-issuer`).

```bash
pnpm serve                       # http://127.0.0.1:8787
cd web && cp .env.example .env   # VITE_API_MODE=http, lalu: pnpm dev
```

| Variabel       | Bawaan       | Fungsi                                                                                                  |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `ZK_HTTP_PORT` | `8787`       | Port server (sama dengan `VITE_API_PROXY` di `web/.env.example`). Host selalu `127.0.0.1`.              |
| `ZK_STATE_DIR` | `.zk-state/` | Kredensial, challenge, dan `holder.json`. Dipakai bersama CLI, jadi CLI dan UI adalah holder yang sama. |

## Dokumentasi API (Scalar)

| URL                 | Isi                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/docs`         | Scalar API Reference. Bundel dilayani dari `node_modules` lewat `/api/docs/assets`, tanpa CDN, sehingga tetap jalan tanpa internet saat sidang. |
| `/api/openapi.json` | Dokumen OpenAPI 3.1, dibangun di `src/interfaces/http/openapi/`.                                                                                |

Tes `tests/unit/interfaces/http.test.ts` memastikan setiap path di dokumen OpenAPI ada di server. Arah sebaliknya
(route baru yang lupa didokumentasikan) belum dijaga otomatis. Ubah `openapi/` bersama route.

## Struktur dan lapisan

```
src/interfaces/http/
  main.ts          entry point: .env, container dengan file store, listen, shutdown
  create-app.ts    rakitan Express (guard localhost, JSON, router, error handler)
  routes/          issuer, holder, verifier, runs (scenarios, runs, SSE), docs
  parsing.ts       validasi badan permintaan -> 400 INVALID_REQUEST
  views.ts         domain -> bentuk kawat (CredentialView dst.), tanpa tanda tangan issuer
  http-error.ts    HttpError dan pemeta galat -> { "error": "<KODE>" }
  local-only.ts    hanya hostname lokal (lawan DNS rebinding)
  runs/            run-registry (satu run, simpan event, replay) dan format SSE
  openapi/         schemas, paths, document
src/application/
  simulation/            event run, katalog skenario, rencana alur, orkestrator `makeRunScenario`
  use-cases/       makeListCredentials, makeListChallenges, makeGetIssuerProfile (baru)
  ports/           CredentialRepository.list, ChallengeStore.list, HolderKeyring (baru)
src/infrastructure/key-management/   keyring holder: file (format sama dengan `holder.json` CLI) dan memori
```

Aturan lapisan di `docs/architecture/overview.md` tetap dijaga `boundaries.test.ts`. `HttpServices` adalah irisan dari
`Container`, jadi tes membangunnya dari fake tanpa chain.

## Perilaku yang perlu diketahui

- **Satu run pada satu waktu.** Run kedua mendapat 409 `RUN_IN_PROGRESS`. Event 20 run terakhir disimpan di memori
  dan diputar ulang dari `seq = 0` untuk klien yang tersambung terlambat. Run yang crash menutup aliran tanpa
  `run.completed`, dan UI melaporkannya sebagai `STREAM_INTERRUPTED`.
- **Holder ada di server.** Kunci holder dibuat saat pertama dipakai dan disimpan di `holder.json` (mode 0600, tidak
  dienkripsi). Ini penyederhanaan simulation seperti di `ui-simulation.md`.
- **Run membuat kredensial sungguhan.** Tiap run menerbitkan kredensial IPK 3,50 (atau sesuai skenario) untuk holder
  simulation, sehingga muncul di wallet dan daftar issuer.
- **Event hanya data publik.** Pemancar menolak (melempar galat) event dengan kunci di luar `PUBLIC_DATA_KEYS`.
- **`challenge-expired`** memakai TTL 0 ms: challenge kedaluwarsa begitu terbit, tanpa menunggu dan dengan hasil sama di
  jam apa pun.
- **Waktu.** `witness.computed` tidak punya durasi sendiri karena witness dibangun di dalam prover. Durasi `proof.generated`
  mencakup keduanya. Durasi `proof.verified` mencakup seluruh verifikasi, termasuk pemeriksaan prasyarat.
- **Gas adalah angka referensi P6.** Saat start, server membaca `gas.verifyCredentialGas` dari run P6 terbaru di
  `experiments/results/<run>/gas/p6-benchmark.json` yang `gas.status`-nya `measured`, mencetaknya di log
  (`Gas reference (P6 run <id>): <angka>`), dan menempelkannya sebagai `gasUsed` pada `proof.verified` yang diterima.
  Tanpa run seperti itu (belum `pnpm experiment:p6`, atau hanya run `--no-gas`) server tetap jalan tanpa `gasUsed`.
  Angka ini tidak dihitung ulang dan bukan pengukuran run itu.

## Cakupan terhadap kontrak

Server memakai satu circuit dan satu `CredentialVerifier` di chain: varian penuh, B4. Karena itu
`applicableConfigurations` hanya berisi `["B4"]`, dan UI menonaktifkan konfigurasi lain.

| Dijalankan di B4 (21)                                                                                | Terdaftar tetapi `applicableConfigurations: []` (5)                                                                            |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 4 honest, `gpa-below-threshold`, `threshold-below-policy`, 3 serangan holder, 6 replay, 6 data rusak | `credential-tampered`, `signature-other-issuer`, `signature-malformed`, `issuer-unregistered`, `claims-challenge-out-of-field` |

Alasan lima yang tertinggal: empat butuh issuer kedua atau kredensial tersimpan yang dirusak (titik desain 1 di
`ui-simulation.md`), satu memanggil `engine.verify` langsung, yang tidak ada di container. Menutup celah ini butuh port atau
fasad baru, bukan perubahan di adapter.

Metadata 26 skenario disalin ke `src/application/simulation/scenario-catalog.ts` karena `src/` tidak boleh mengimpor
`experiments/` maupun `tests/` (titik desain 2). `tests/unit/experiments/simulation-catalog-sync.test.ts` gagal bila salinan itu
berbeda dari `experiments/scenarios/catalog.ts`.

## Merekam cadangan sidang

Dengan server berjalan (`pnpm serve`), rekam run sungguhan untuk dipakai bila simulation live bermasalah:

```bash
pnpm record:simulation                                          # valid-accepted dan replay-same-proof pada B4
pnpm record:simulation --scenario=valid-accepted,relay-to-other-verifier
pnpm record:simulation --url=http://127.0.0.1:8787 --out=web/public/recordings --configuration=B4
```

Perekam menjalankan skenario satu per satu lewat `POST /api/runs`, membaca SSE sampai `run.completed`, dan menulis
`<out>/<skenario>.<konfigurasi>.json` serta `<out>/index.json` (digabung dengan yang sudah ada). Berkas masuk Git supaya
ikut ke mesin sidang. Tiap run membuat satu kredensial dan memakai satu proof Groth16, jadi butuh prasyarat yang sama
dengan simulation live. Format dan aturan pemutaran ada di [contract.md](contract.md#format-rekaman).

## Pengujian

| Perintah        | Isi                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`     | Orkestrator dan adapter dengan engine tiruan yang meniru binding circuit (hanya kunci pemilik yang bisa membuktikan, proof hanya sah untuk klaim aslinya): urutan event, node penolak, allowlist, gas referensi, pembaca hasil P6, perekam rekaman terhadap server Express asli, 200/400/404/409/500, SSE dan replay, guard localhost, Scalar. |
| `pnpm test:e2e` | `tests/e2e/http-flow.test.ts`: alur peran dan tujuh skenario dengan proof Groth16 sungguhan di chain Hardhat.                                                                                                                                                                                                                                  |

Hasil `pnpm test` dengan engine tiruan membuktikan pemetaan dan urutan event, bukan kebenaran kriptografi. Klaim
penelitian tetap bersandar pada P5 dan P6.

## Tindak lanjut

- Server untuk A, SD, B1-B3 (container per varian, dan runner SD-JWT yang sama dengan P5/P6).
- Lima skenario yang belum berlaku di atas.
- Pemeriksaan otomatis arah sebaliknya: setiap route punya entri OpenAPI.
