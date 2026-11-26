import { Info } from 'lucide-react';
import type { Container } from '@/application';
import { Alert, AlertDescription, AlertTitle } from '@/ui/components/alert';

const LINK = 'font-medium underline underline-offset-4';

function MockBanner() {
  return (
    <Alert variant="pending">
      <Info />
      <AlertTitle>Mode mock</AlertTitle>
      <AlertDescription>
        Event dan proof di halaman ini dibuat skrip di browser, bukan Groth16 sungguhan. Waktu dan ukuran hanya contoh. Jalankan
        demo server dan set VITE_API_MODE=http untuk proof sungguhan.
      </AlertDescription>
    </Alert>
  );
}

const recordedOn = (iso: string | undefined): string =>
  iso && !Number.isNaN(Date.parse(iso))
    ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
    : 'tanggal tidak diketahui';

function ReplayBanner({ recordedAt }: { readonly recordedAt: string | undefined }) {
  return (
    <Alert variant="pending">
      <Info />
      <AlertTitle>Rekaman cadangan, bukan demo live</AlertTitle>
      <AlertDescription>
        Event di halaman ini adalah rekaman run sungguhan pada server demo ({recordedOn(recordedAt)}), diputar ulang dengan jeda
        aslinya yang dibatasi. Tidak ada proof yang dibuat sekarang, dan hanya skenario yang direkam yang bisa dipilih. Halaman
        Issuer, Holder, dan Verifier butuh server live.{' '}
        <a className={LINK} href="?mode=http#/simulator">
          Kembali ke server live
        </a>
      </AlertDescription>
    </Alert>
  );
}

function LiveFallback() {
  return (
    <p className="text-sm text-muted-foreground">
      Demo live bermasalah?{' '}
      <a className={LINK} href="?mode=replay#/simulator">
        Buka rekaman cadangan
      </a>
      .
    </p>
  );
}

/** The limits that ui-demo.md requires to be stated in the UI, plus the way to the backup when the live demo fails. */
export function DemoLimits({ container }: { readonly container: Container }) {
  return (
    <div className="grid gap-3">
      {container.mode === 'mock' && <MockBanner />}
      {container.mode === 'replay' && <ReplayBanner recordedAt={container.recordedAt} />}
      {container.mode === 'http' && <LiveFallback />}
      <details className="rounded-lg border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Batasan demo</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted-foreground">
          <li>
            Proof dibuat di server (Node saja), jadi kunci privat holder ada di server. Ini penyederhanaan demo, bukan arsitektur
            klien yang sebenarnya.
          </li>
          <li>Event hanya membawa data publik. Kunci privat, atribut kredensial, dan secret tidak dikirim ke klien lewat SSE.</li>
          <li>Tanpa autentikasi: server hanya untuk localhost, bukan untuk jaringan publik.</li>
          <li>
            Trusted setup dan chain bersifat lokal dan tidak mewakili produksi. Gas di node Contract adalah angka referensi hasil
            P6 (<code className="font-mono text-xs">estimateGas</code>, hanya B4), bukan pengukuran run ini dan tidak dihitung
            ulang.
          </li>
          <li>Satu simulasi pada satu waktu. B4 membutuhkan sekitar 850 MB memori puncak.</li>
        </ul>
      </details>
    </div>
  );
}
