# UI simulation: kontrak desain

Dokumen ini menurunkan rancangan di [`docs/architecture/ui-simulation.md`](../architecture/ui-simulation.md) menjadi kontrak yang
bisa dikerjakan. Status: frontend `web/` berjalan dengan data mock atau lewat HTTP, dan adapter Express (tahap U1) sudah ada,
lihat [server.md](server.md). Kontrak di sini adalah syarat yang dipenuhi adapter itu.

| Dokumen                            | Isi                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| [contract.md](contract.md)         | Kontrak server dan UI: tipe, endpoint, SSE, katalog event, pemetaan penolakan                 |
| [walkthrough.md](walkthrough.md)   | Panduan menjalankan simulation: persiapan, alur Issuer ke Verifier, simulator, skenario, dan aturan |
| [server.md](server.md)             | Adapter Express: cara menjalankan, dokumentasi API (Scalar), struktur, cakupan dan batas      |
| [architecture.md](architecture.md) | Arsitektur `web/`: lapisan, aturan dependensi, modul, state Jotai, graf React Flow            |
| [screens.md](screens.md)           | Halaman, komponen, state kosong dan galat, teks antarmuka, aksesibilitas, token desain        |

## Tumpukan

Vite, React 19, React Flow (`@xyflow/react`), Jotai, shadcn/ui (Radix, Tailwind v4). Tipe dan aturan lapisan memakai
TypeScript strict seperti `src/`.

## Menjalankan

```bash
pnpm install
cd web
cp .env.example .env     # VITE_API_MODE=mock (bawaan) atau http
pnpm dev                 # http://localhost:5173
pnpm test                # unit: reducer graf, playback, skrip mock, batas lapisan
pnpm build
```

Tiga mode, dipilih lewat `VITE_API_MODE` atau `?mode=` di URL (query menang atas env):

- `mock`: seluruh event dan "proof" dibuat skrip di browser. Cocok untuk mengembangkan tampilan tanpa chain dan
  tanpa artefak `pnpm setup:zk`. UI menampilkan banner "Mode mock" karena tidak ada Groth16 sungguhan.
- `http`: UI bicara ke simulation server (`pnpm serve`) lewat proxy `/api` (`VITE_API_PROXY`, bawaan `http://127.0.0.1:8787`).
  Prasyaratnya sama dengan CLI: artefak `pnpm setup:zk`, chain lokal, dan alamat kontrak di `.env`. Dokumentasi API
  interaktif ada di `http://127.0.0.1:8787/api/docs`.
- `replay`: memutar ulang rekaman run sungguhan dari `web/public/recordings/`, tanpa server. Cadangan sidang bila simulation
  live bermasalah. Rekam dulu dengan `pnpm record:simulation` saat server hidup (lihat [server.md](server.md)). Hanya
  Simulator, hanya skenario yang direkam.

## Hubungan dengan ui-simulation.md

Semua tujuan, non-tujuan, dan batasan keamanan di `ui-simulation.md` tetap berlaku. Yang ditambahkan dokumen ini
dicatat di bagian "Catatan sinkronisasi" pada [contract.md](contract.md), supaya `ui-simulation.md` bisa diperbarui saat
D10 disetujui.
