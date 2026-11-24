import { useAtom, useAtomValue } from 'jotai';
import { formatGpa } from '@/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { cn } from '@/ui/lib/cn';
import { selectedCredentialIdAtom, walletAtom } from './model';

export function WalletCard() {
  const wallet = useAtomValue(walletAtom);
  const [selected, select] = useAtom(selectedCredentialIdAtom);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wallet</CardTitle>
        <CardDescription>Kredensial yang diterima dari issuer. Hanya holder yang melihat isi lengkapnya.</CardDescription>
      </CardHeader>
      <CardContent>
        {wallet.length === 0 ? (
          <p className="text-sm text-muted-foreground">Wallet kosong. Terbitkan kredensial lewat halaman Issuer.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Kredensial di wallet">
            {wallet.map((credential) => (
              <li key={credential.id}>
                <button
                  type="button"
                  aria-pressed={selected === credential.id}
                  onClick={() => select(credential.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent',
                    selected === credential.id && 'border-primary bg-accent',
                  )}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{credential.fullName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {credential.degree} · {credential.studentNumber}
                    </span>
                  </span>
                  <span className="font-serif text-lg font-semibold">{formatGpa(credential.gpa)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
