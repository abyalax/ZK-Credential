import { useAtomValue, useSetAtom } from 'jotai';
import { type FormEvent, useState } from 'react';
import { parseGpa } from '@/shared';
import { Button } from '@/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Input } from '@/ui/components/input';
import { Label } from '@/ui/components/label';
import { issueCredentialAtom, issueStateAtom } from './model';

const field = (id: string, label: string, props: React.ComponentProps<typeof Input>) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} name={id} {...props} />
  </div>
);

export function IssueForm() {
  const issue = useSetAtom(issueCredentialAtom);
  const state = useAtomValue(issueStateAtom);
  const [values, setValues] = useState({
    studentNumber: '2210001',
    fullName: 'Test Student',
    degree: 'S1 Teknik Komputer',
    graduationDate: '2026-08-01',
    gpa: '3.75',
  });
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((previous) => ({ ...previous, [key]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    issue({ ...values, gpa: parseGpa(values.gpa) ?? Number.NaN });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terbitkan kredensial</CardTitle>
        <CardDescription>Data sintetis. IPK disimpan sebagai bilangan bulat × 100 agar muat di circuit.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3">
          {field('studentNumber', 'NIM', { value: values.studentNumber, onChange: set('studentNumber') })}
          {field('fullName', 'Nama', { value: values.fullName, onChange: set('fullName') })}
          {field('degree', 'Gelar', { value: values.degree, onChange: set('degree') })}
          <div className="grid grid-cols-2 gap-3">
            {field('graduationDate', 'Tanggal lulus', {
              type: 'date',
              value: values.graduationDate,
              onChange: set('graduationDate'),
            })}
            {field('gpa', 'IPK', { type: 'number', step: '0.01', min: '0', max: '4', value: values.gpa, onChange: set('gpa') })}
          </div>
          <Button type="submit" disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'Menandatangani…' : 'Terbitkan kredensial'}
          </Button>
          {state.status === 'error' && <p className="text-sm text-rejected">{state.message}</p>}
          {state.status === 'done' && (
            <p className="text-sm text-accepted">Kredensial {state.value.id} diterbitkan dan masuk ke wallet holder.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
