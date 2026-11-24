import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/ui/components/alert';

/** The limits that ui-demo.md requires to be stated in the UI. */
export function DemoLimits({ mode }: { readonly mode: 'mock' | 'http' }) {
  return (
    <div className="grid gap-3">
      {mode === 'mock' && (
        <Alert variant="pending">
          <Info />
          <AlertTitle>Mode mock</AlertTitle>
          <AlertDescription>
            Event dan proof di halaman ini dibuat skrip di browser, bukan Groth16 sungguhan. Waktu dan ukuran hanya contoh.
            Jalankan demo server dan set VITE_API_MODE=http untuk proof sungguhan.
          </AlertDescription>
        </Alert>
      )}
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
            Trusted setup dan chain bersifat lokal dan tidak mewakili produksi. Gas ditampilkan dari hasil P6, tidak dihitung
            ulang.
          </li>
          <li>Satu simulasi pada satu waktu. B4 membutuhkan sekitar 850 MB memori puncak.</li>
        </ul>
      </details>
    </div>
  );
}
