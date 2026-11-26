# UI demo: kontrak desain

Dokumen ini menurunkan rancangan di [`docs/architecture/ui-demo.md`](../architecture/ui-demo.md) menjadi kontrak yang
bisa dikerjakan. Status: frontend `web/` berjalan dengan data mock atau lewat HTTP, dan adapter Express (tahap U1) sudah ada,
lihat [server.md](server.md). Kontrak di sini adalah syarat yang dipenuhi adapter itu.

| Dokumen                            | Isi                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| [contract.md](contract.md)         | Kontrak server dan UI: tipe, endpoint, SSE, katalog event, pemetaan penolakan                 |
| [walkthrough.md](walkthrough.md)   | Panduan menjalankan demo: persiapan, alur Issuer ke Verifier, simulator, skenario, dan aturan |
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

Dua mode, dipilih lewat `VITE_API_MODE`:

- `mock`: seluruh event dan "proof" dibuat skrip di browser. Cocok untuk mengembangkan tampilan tanpa chain dan
  tanpa artefak `pnpm setup:zk`. UI menampilkan banner "Mode mock" karena tidak ada Groth16 sungguhan.
- `http`: UI bicara ke demo server (`pnpm serve`) lewat proxy `/api` (`VITE_API_PROXY`, bawaan `http://127.0.0.1:8787`).
  Prasyaratnya sama dengan CLI: artefak `pnpm setup:zk`, chain lokal, dan alamat kontrak di `.env`. Dokumentasi API
  interaktif ada di `http://127.0.0.1:8787/api/docs`.

## Hubungan dengan ui-demo.md

Semua tujuan, non-tujuan, dan batasan keamanan di `ui-demo.md` tetap berlaku. Yang ditambahkan dokumen ini
dicatat di bagian "Catatan sinkronisasi" pada [contract.md](contract.md), supaya `ui-demo.md` bisa diperbarui saat
D10 disetujui.
