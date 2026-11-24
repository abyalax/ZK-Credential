import { useAtomValue } from 'jotai';
import { formatGpa, shorten } from '@/shared';
import { Badge } from '@/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { issuedAtom, issuerProfileAtom } from './model';

export function IssuerProfileCard() {
  const profile = useAtomValue(issuerProfileAtom);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile?.name ?? 'Issuer'}</CardTitle>
        <CardDescription>Kunci publik issuer dan status registrasinya di kontrak IssuerRegistry.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {profile ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">ID</span>
              <span>{profile.id}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Kunci publik</span>
              <code className="font-mono text-xs">{shorten(profile.publicKey, 10, 8)}</code>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Registrasi</span>
              <Badge variant={profile.registered ? 'accepted' : 'pending'}>
                {profile.registered ? 'Terdaftar' : 'Belum terdaftar'}
              </Badge>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Memuat profil issuer…</p>
        )}
      </CardContent>
    </Card>
  );
}

export function IssuedList() {
  const issued = useAtomValue(issuedAtom);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kredensial yang diterbitkan</CardTitle>
      </CardHeader>
      <CardContent>
        {issued.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada. Isi form di samping untuk menerbitkan kredensial pertama.</p>
        ) : (
          <ul className="divide-y text-sm">
            {issued.map((credential) => (
              <li key={credential.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{credential.fullName}</span>
                  <span className="text-muted-foreground"> · {credential.studentNumber}</span>
                </span>
                <span className="font-serif text-base font-semibold">{formatGpa(credential.gpa)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
