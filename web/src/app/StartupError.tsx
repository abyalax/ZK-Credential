import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/ui/components/alert';

const NO_RECORDINGS =
  'Rekaman cadangan belum ada. Jalankan server (pnpm serve), lalu pnpm record:demo, dan muat ulang halaman ini.';

const explain = (code: string): string => (code.startsWith('RECORDINGS_') ? NO_RECORDINGS : code);

/** Shown when the container cannot be built, which only happens in replay mode when the recordings are missing or broken. */
export function StartupError({ message }: { readonly message: string }) {
  return (
    <main className="mx-auto grid max-w-2xl gap-4 px-6 py-16">
      <Alert variant="rejected">
        <TriangleAlert />
        <AlertTitle>Demo tidak bisa dimulai</AlertTitle>
        <AlertDescription>
          {explain(message)} <code className="font-mono text-xs">{message}</code>
        </AlertDescription>
      </Alert>
      <p className="text-sm text-muted-foreground">
        <a className="font-medium underline underline-offset-4" href="?mode=http#/simulator">
          Coba server live
        </a>{' '}
        atau{' '}
        <a className="font-medium underline underline-offset-4" href="?mode=mock#/simulator">
          mode mock
        </a>
        .
      </p>
    </main>
  );
}
