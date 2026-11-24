# Arsitektur web/

`web/` adalah paket terpisah (workspace pnpm). Ia hanya bicara HTTP dan SSE dengan server. `src/` tidak mengimpor
`web/`, dan `web/` tidak mengimpor `src/`. Tipe yang sama ditulis ulang di `web/src/domain/` sesuai
[contract.md](contract.md), bukan dibagi lewat impor, supaya batas paket tetap bersih.

## Lapisan dan aturan dependensi

Mengikuti aturan di `docs/architecture/overview.md`, impor hanya menunjuk ke dalam:

```
app (composition root, shell)
  -> features (UI per modul + state Jotai)   -> ui (shadcn, tanpa logika)
  -> infrastructure (HTTP, SSE, mock)
features        -> application -> domain -> shared
infrastructure  -> application -> domain -> shared     (mengimplementasikan port)
```

| Lapisan            | Isi                                                                                                        | Boleh mengimpor                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `shared/`          | `Result`, format angka dan waktu. Murni.                                                                   | -                                       |
| `domain/`          | Tipe kontrak, konfigurasi A/SD/B1-B4, katalog skenario, reducer graf, playback, pemetaan penolakan. Murni. | `shared`                                |
| `application/`     | Port gateway (`Container`) dan use case (`makeStartSimulation`, `makeRunComparison`, use case role page).  | `domain`, `shared`                      |
| `infrastructure/`  | Gateway HTTP, klien SSE, gateway mock, `createContainer(mode)`.                                            | `application`, `domain`, `shared`       |
| `features/`        | Satu folder per modul: atom Jotai, komponen, halaman. Hanya memakai gateway lewat `containerAtom`.         | `application`, `domain`, `shared`, `ui` |
| `ui/`              | Komponen shadcn dan `cn`. Tidak tahu domain.                                                               | paket pihak ketiga saja                 |
| `app/`, `main.tsx` | Shell, routing hash, batasan demo. `main.tsx` memilih gateway dan memasang `containerAtom`.                | semua                                   |

`domain/` dan `shared/` tidak mengimpor paket apa pun, sama seperti `domain/` di `src/`. Aturan ini diuji di
`web/tests/boundaries.test.ts`, termasuk larangan modul fitur mengimpor modul fitur lain.

## Struktur

```
web/
  src/
    main.tsx                  composition root
    app/                      App.tsx (shell), route.ts (hash), DemoLimits.tsx, styles.css (token)
    shared/                   result.ts, lib/format.ts
    domain/                   configuration, credential, proof, run-event, graph, playback, scenario, verification
    application/
      ports/gateways.ts       IssuerGateway, HolderGateway, VerifierGateway, RunGateway, Container
      use-cases/              run-simulation.ts, manual-flow.ts
    infrastructure/
      http/                   client.ts, sse.ts, http-gateways.ts
      mock/                   catalog.ts (26 skenario), run-script.ts, mock-run-gateway.ts, mock-manual-gateways.ts
      index.ts                createContainer(mode)
    features/
      container.ts            containerAtom
      shared/                 async.ts, copy.ts, hooks.ts, state.ts, RedactedCredential, OutcomeBadge, PageHeader
      issuer/ holder/ verifier/ simulator/
    ui/components, ui/lib     shadcn
  tests/                      graph, playback, mock-script, boundaries
```

## Composition root

`main.tsx` membaca `VITE_API_MODE`, memanggil `createContainer(mode)`, dan menaruh hasilnya di store Jotai lewat
`containerAtom`. Atom aksi memanggil use case dengan gateway dari `containerOf(get)`. Mengganti mock dengan server
sungguhan tidak menyentuh `features/`.

## Modul dan state Jotai

Setiap modul memiliki atom sendiri; satu-satunya state yang dipakai lintas modul ada di `features/shared/state.ts`.

| Modul        | Atom state                                                                                                                                 | Atom aksi (write-only)                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `issuer`     | `issuerProfileAtom`, `issuedAtom`, `issueStateAtom`                                                                                        | `refreshIssuerAtom`, `issueCredentialAtom`                                                                     |
| `holder`     | `walletAtom`, `openChallengesAtom`, `selectedCredentialIdAtom`, `selectedChallengeAtom`, `thresholdAtom`, `proofStateAtom`                 | `refreshHolderAtom`, `createProofAtom`, `sendPresentationAtom`                                                 |
| `verifier`   | `requiredThresholdAtom`, `challengesAtom`, `pastedProofAtom`, `resultAtom`                                                                 | `refreshVerifierAtom`, `issueChallengeAtom`, `verifyAtom`                                                      |
| `simulator`  | `configurationAtom`, `scenarioIdAtom`, `scenariosAtom`, `playbackAtom`, `runAtom`, `compareRowsAtom`, `comparingAtom`; turunan `graphAtom` | `loadScenariosAtom`, `startRunAtom`, `stopRunAtom`, `nextStepAtom`, `setPlaybackModeAtom`, `runComparisonAtom` |
| lintas modul | `presentationInboxAtom` (presentasi yang dikirim holder di tab ini)                                                                        | -                                                                                                              |

Aturan:

- **Server adalah sumber kebenaran.** Role page memuat ulang state dari server tiap 3 detik (`usePolling`), sehingga
  issuer, holder, dan verifier yang dibuka di tab berbeda tetap sinkron. Di mode mock tiap tab punya state sendiri.
- Status asinkron memakai satu bentuk, `Async<T>`: `idle | loading | error | done`.
- `graphAtom` diturunkan dari `playbackAtom.applied` lewat `replay`, jadi graf selalu bisa dibangun ulang dari log event.
- Satu fungsi atau berkas mengikuti batas `overview.md`: fungsi di bawah 50 baris, berkas di bawah 300 baris, parameter
  lebih dari empat dijadikan objek, tanpa `await` di dalam loop (perbandingan B1-B4 dirantai dengan `reduce` + `then`).

## Alur event di simulator

```
POST /api/runs ──> runId ──> EventSource(/api/runs/:id/events)
                                  │ RunEvent
                                  ▼
                     playbackAtom.receive ──(mode auto)──> applied
                                  └─(mode langkah)──> pending ──nextStepAtom──> applied
                                                                        │
                                           graphAtom = replay(applied) ◄┘
                                                    │
                      FlowCanvas (React Flow)   EventLog   OutcomeBanner
```

- Mode langkah-per-langkah menahan event di `pending` dan hanya menerapkannya saat tombol ditekan. Mematikan mode
  langkah menerapkan semua event yang tertahan.
- `OutcomeBanner` baru tampil setelah `run.completed` diterima dan `pending` kosong, supaya hasil tidak mendahului
  penjelasan lisan.
- `seq` ganda dibuang (aliran yang dikirim ulang tidak menggandakan langkah).

## Graf React Flow

Graf berbentuk tetap; yang dinamis hanya status. Definisi ada di `domain/graph.ts` (`GRAPH_NODES`, `GRAPH_EDGES`),
penggambarannya di `features/simulator/`.

```
 Issuer ─────credential────────► Holder
                                  ▲  │
                         challenge│  │presentasi
                                  │  ▼
 Contract ◄──proof + signals──── Verifier
```

| Edge                 | Dinyalakan oleh langkah                              | Isi chip                                          |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| `issuer->holder`     | `credential.issued`                                  | `credentialId`, `issuerId`                        |
| `verifier->holder`   | `challenge.issued`                                   | `verifierId`, `challenge`, `expiresAt`            |
| `holder->verifier`   | `presentation.sent`                                  | `gpaThreshold`, `challenge`, `attributesRevealed` |
| `verifier->contract` | `issuer.checked`, `proof.verified` (node `contract`) | `issuerId`, `gasUsed`                             |

Status node: `idle` (abu), `active` (biru, berdenyut), `done` (hijau), `rejected` (merah, menampilkan `reason` dan
penjelasannya). Status edge: `idle`, `flowing` (garis putus-putus bergerak), `done`, `blocked` (merah). Animasi hanya
berjalan saat ada event dan dimatikan oleh `prefers-reduced-motion`. Node tidak bisa digeser, graf tidak di-zoom
dengan scroll, dan atribusi React Flow dibiarkan tampil.

Dua edge menghubungkan Holder dan Verifier; masing-masing keluar dan masuk lewat handle di sisi kiri atau kanan bawah
dan atas node (`tl`, `bl`, `tr`, `br`), dengan label diletakkan di sisi luar agar tidak bertumpuk.

## Mock

`infrastructure/mock/` memenuhi port yang sama dengan HTTP:

- 26 skenario dengan id, judul, kategori, `openIn`, dan alasan seperti `experiments/scenarios/catalog.ts`.
- `buildRunScript(configuration, scenario)` murni: menghasilkan event berjeda dan hasil akhir dari `expectedOutcome`.
  Durasi hanyalah contoh dan alasan penolakan memakai nilai varian penuh; keduanya bukan pengukuran.
- Role page memakai wallet, challenge store, dan "proof" palsu di memori. Aturan replay tetap bekerja (presentasi yang
  sama dua kali menghasilkan `CHALLENGE_ALREADY_USED`), tetapi pemeriksaan kriptografinya tidak ada.

Mock tidak boleh dipakai untuk klaim penelitian. Banner "Mode mock" selalu tampil selama mode ini aktif.

## Pengujian

- `tests/graph.test.ts`: reducer graf, pemetaan node penolak.
- `tests/playback.test.ts`: mode otomatis dan langkah, pembuangan `seq` ganda.
- `tests/mock-script.test.ts`: 22 serangan dan 4 honest, kesesuaian dengan `expectedOutcome` untuk tiap pasangan skenario
  dan konfigurasi, allowlist data publik, celah ablation pada `replay-relabelled-challenge`.
- `tests/mock-manual-flow.test.ts`: alur role page di mock (terima sekali, replay ditolak, threshold di atas IPK, verifier salah).
- `tests/boundaries.test.ts`: aturan lapisan di atas.

Belum ada tes komponen atau tes browser. Pemeriksaan tampilan dilakukan manual lewat `pnpm dev`.
