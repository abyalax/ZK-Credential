# Rancangan UI demo (opsional, status: rancangan, belum dikerjakan)

Rancangan ini dibuat untuk kemungkinan dosen meminta demo yang lebih mudah dipahami saat sidang.
Belum ada kode. Fase ini berada di jalur "Opsional" rencana skripsi (keputusan D4) dan dikerjakan
setelah run P6 di mesin penulis serta Bab 4 dan Bab 5 selesai, sehingga tidak menggeser jalur kritis.

## Tujuan dan non-tujuan

Tujuan:

- Menjelaskan cara kerja sistem secara visual, per role (issuer, holder, verifier).
- Menjalankan proof Groth16 sungguhan dan menampilkan langkah serta waktunya secara realtime.
- Memvisualkan ablation dan serangan: konfigurasi mana yang menolak serangan apa, dan di langkah mana.

Non-tujuan:

- Bukan produk: tanpa autentikasi, akun, database, atau deployment publik.
- Bukan editor workflow bebas (drag-and-drop ala n8n). Graph berbentuk tetap; yang realtime adalah
  eksekusinya.
- Tidak mengubah klaim penelitian, protokol, circuit, maupun kontrak.

## Keputusan yang diusulkan (D10, menunggu persetujuan)

| ID  | Keputusan       | Opsi                                                      | Usulan                                                                  |
| --- | --------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| D10 | Cakupan UI demo | (a) tidak ada UI; (b) role page + simulator; (c) UI penuh | (b), dikerjakan setelah P6 dan Bab 4/5; rencana v1.6 mencatat perubahan |

Bila disetujui, D4 berubah dari "CLI + test suite dulu; Express menyusul" menjadi "CLI + test suite,
lalu Express + UI demo untuk sidang", dan log perubahan rencana mendapat entri v1.6.

## Arsitektur

Mengikuti aturan lapisan di `overview.md`: `interfaces -> infrastructure -> application -> domain`.

```
web/                         UI (Vite + React + React Flow), paket terpisah, hanya bicara HTTP/SSE
src/interfaces/http/         adapter Express tipis (kosong saat ini, "HTTP is on hold")
src/interfaces/composition/  container yang sama dengan CLI (create-container.ts)
src/application/use-cases/   makeIssueCredential, makeIssueChallenge, makeGenerateProof, makeVerifyCredential
```

- Adapter HTTP hanya memetakan request ke use case yang sudah ada dan memetakan `Result` ke respons;
  tidak ada logika protokol baru. Container dipakai ulang, sehingga proof dibuat oleh `ProofEngine` snarkjs dan
  diverifikasi lewat kontrak seperti CLI.
- State tetap in-memory lewat port yang ada (`CredentialRepository`, `ChallengeStore`), atau berkas JSON
  seperti `.zk-state/`. Tanpa database; port yang sama memungkinkan penggantian nanti.
- `web/` tidak diimpor oleh `src/`, dan `src/` tidak mengimpor `web/`. Pemeriksaan batas lapisan di
  `tests/unit/architecture/boundaries.test.ts` tetap berlaku untuk `src/`.
- Prasyarat jalan: artefak `pnpm setup:zk` ada, dan chain lokal sesuai `AppConfig` (RPC, alamat
  `IssuerRegistry` dan `CredentialVerifier`) berjalan, sama seperti CLI.

### Titik desain yang perlu diputuskan saat implementasi

1. **Satu issuer di konfigurasi.** `AppConfig.issuer` hanya memuat satu issuer dari env. Skenario
   "issuer tidak terdaftar" dan "issuer lain" butuh issuer kedua; usulannya dibuat oleh adapter demo
   sebagai kunci sekali pakai (seperti `rogueKeys` di harness P5), bukan lewat konfigurasi.
2. **Skenario serangan.** Definisi serangan ada di `experiments/scenarios/catalog.ts` dan memakai
   `tests/support/`. Server tidak boleh bergantung langsung pada `tests/`. Pilihannya: pindahkan
   definisi serangan ke modul bersama yang tidak bergantung pada vitest, atau demo memakai fasad tipis
   yang memanggil runner P5. Usulan: modul bersama, dengan `experiments/` dan demo sebagai pemakai.
3. **Konfigurasi A dan SD.** Keduanya tidak memakai circuit. Demo memakai runner dan modul SD-JWT
   yang sama dengan P5 dan P6, bukan implementasi baru.

## Model event realtime (SSE)

Satu "run" adalah satu alur (penerbitan sampai verifikasi) atau satu skenario serangan. Server
mengirim event ke `GET /api/runs/:id/events` lewat SSE.

```ts
interface RunEvent {
  readonly runId: string;
  readonly seq: number; // urutan, untuk menyusun ulang di klien
  readonly node: 'issuer' | 'holder' | 'verifier' | 'contract';
  readonly step: string; // mis. 'credential.issued', 'challenge.issued', 'proof.generated'
  readonly status: 'started' | 'completed' | 'rejected';
  readonly at: number; // epoch ms (dari Clock port)
  readonly durationMs?: number;
  readonly data?: Record<string, string | number>; // hanya data publik (lihat bagian keamanan demo)
  readonly reason?: string; // alasan penolakan, nilai yang sama dengan hasil P5
}
```

Langkah per alur normal: `credential.issued` (issuer), `challenge.issued` (verifier),
`witness.computed` dan `proof.generated` (holder, dengan waktu), `presentation.sent`,
`proof.verified` (verifier atau contract), `challenge.consumed`. Penolakan memakai `status: 'rejected'`
dengan `reason` (mis. `KEY_BINDING_INVALID`), dan node penolak menyala merah.

## API (sketsa)

| Method dan path                    | Memanggil              | Catatan                                                      |
| ---------------------------------- | ---------------------- | ------------------------------------------------------------ |
| `POST /api/issuer/credentials`     | `makeIssueCredential`  | Body: NIM, nama, gelar, tanggal lulus, IPK × 100             |
| `GET  /api/holder/credentials`     | `CredentialRepository` | Isi wallet holder                                            |
| `POST /api/verifier/challenges`    | `makeIssueChallenge`   | Body: verifier, TTL                                          |
| `POST /api/holder/proofs`          | `makeGenerateProof`    | Body: credentialId, challenge, threshold                     |
| `POST /api/verifier/verifications` | `makeVerifyCredential` | Body: proof dan public signals                               |
| `POST /api/runs`                   | orkestrator demo       | Body: konfigurasi (A, SD, B1-B4), skenario (normal/serangan) |
| `GET  /api/runs/:id/events`        | SSE                    | Event di atas                                                |
| `GET  /api/scenarios`              | katalog serangan       | 22 serangan + 4 honest, dan padanan SD                       |

Kode status mengikuti hasil `Result`: penolakan protokol adalah hasil normal (HTTP 200 dengan
`accepted: false` dan `reason`), bukan error server.

## Halaman

### Role page (mode manual, "coba sendiri")

Role dipilih lewat switcher biasa tanpa login. State dibagi antar tab, sehingga issuer, holder,
dan verifier dapat dibuka berdampingan saat sidang.

- **Issuer:** daftar kredensial yang diterbitkan dan form penerbitan. Menampilkan kunci publik issuer
  dan status registrasi di `IssuerRegistry`.
- **Holder:** wallet kredensial, challenge masuk, pemilihan threshold, tombol "Buat proof" dengan
  progres dan waktu, serta panel "dibuka vs tersembunyi" (nilai IPK, nama, NIM tampil buram; yang
  terlihat verifier hanya threshold, issuer, challenge, dan verifier).
- **Verifier:** kebijakan (threshold, konfigurasi), pembuatan challenge dengan hitung mundur expiry,
  penerimaan presentasi, hasil dengan alasan, dan status challenge (dibuat, dikonsumsi, kedaluwarsa).

### Simulator (mode penjelasan)

- Graph tetap: Issuer, Holder, Verifier, dan Contract, dengan edge yang menampilkan payload yang lewat.
- Node dan edge menyala mengikuti event SSE; panel samping menampilkan log langkah dan waktunya.
- Kontrol: pilih konfigurasi (A, SD, B1-B4), pilih skenario (alur normal atau salah satu serangan),
  tombol "jalankan", dan mode langkah-per-langkah untuk penjelasan lisan.
- **Mode serangan:** pilih satu dari 22 serangan; graph menunjukkan node dan alasan penolakan, atau
  bahwa serangan lolos pada B1-B3 (sama dengan `openIn` di katalog dan hasil P5).
- **Mode bandingkan:** satu serangan dijalankan pada B1-B4 secara berurutan; tabel kecil menunjukkan
  diterima atau ditolak per konfigurasi. Ini memvisualkan ablation.
- **Panel "yang diketahui verifier":** A = 8 atribut, SD = IPK persis, B1-B4 = 0 atribut
  (nilai `attributesRevealed` pada `experiments/configurations`).

## Keamanan dan keterbatasan demo

Harus dinyatakan di UI dan dicatat di batasan skripsi:

- Proof dibangun di server (D5: Node saja). Di demo, private key holder berada di server; ini
  penyederhanaan demo, bukan arsitektur klien yang sebenarnya.
- Event hanya membawa data publik. Private key, atribut kredensial, dan secret tidak dikirim ke
  klien lewat SSE atau log.
- Tanpa autentikasi: server hanya untuk `localhost`, bukan untuk jaringan publik.
- Trusted setup dan chain tetap lokal dan tidak mewakili produksi (sama dengan batasan lain).
- Gas ditampilkan sebagai angka hasil P6 (`estimateGas`), bukan dihitung ulang.
- Satu simulasi pada satu waktu: peak RSS B4 sekitar 850 MB dan prove sekitar 1 detik.

## Pengujian

- Unit: pemetaan `Result` ke respons HTTP, dan urutan serta isi event untuk setiap alur dan penolakan.
- Integrasi: satu run normal dan beberapa serangan (replay, relabel, tanda tangan) lewat HTTP dengan
  proof sungguhan, hasilnya sama dengan P5. Dijalankan di mesin biasa, bukan sandbox.
- Pemeriksaan bahwa event tidak memuat nilai privat (daftar kunci yang diizinkan).
- Cadangan sidang: rekaman layar satu alur normal dan satu serangan, bila demo live bermasalah.

## Tahapan dan estimasi kasar

| Tahap | Isi                                                                   | Estimasi |
| ----- | --------------------------------------------------------------------- | -------- |
| U1    | Adapter Express, endpoint role, SSE, pengujian adapter                | 2-3 hari |
| U2    | Tiga role page (issuer, holder, verifier)                             | 3-4 hari |
| U3    | Simulator: graph, event, mode serangan dan bandingkan, panel verifier | 4-5 hari |
| U4    | Polesan, cadangan rekaman, catatan batasan di skripsi                 | 1-2 hari |

Total kira-kira 1,5-2 minggu; estimasi tahap visual biasanya meleset. Bila waktu mepet, urutan
pemotongan: U3 mode bandingkan, lalu role page issuer. Simulator mode serangan paling bernilai untuk
sidang dan dipertahankan paling akhir.

## Dampak ke dokumen lain (saat disetujui)

- Rencana skripsi: D10, perubahan D4, dan log v1.6.
- `overview.md`: baris `interfaces/` tidak lagi berstatus "HTTP is on hold".
- `threats-to-validity.md`: batasan demo di atas.
- `TODO.md`: item kondisional "Adapter Express, UI" dipindahkan menjadi item U1-U4.
