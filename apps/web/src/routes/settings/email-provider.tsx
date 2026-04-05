import { useState, useEffect } from 'react';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  Input,
  Select,
  Button,
  Badge,
  useToast,
} from '@/components/ui';
import {
  useEmailProviderConfig,
  useUpdateEmailProvider,
  useSendTestEmail,
} from '@/hooks/queries/use-email-settings';

const PROVIDER_OPTIONS = [
  { value: '', label: 'Not configured' },
  { value: 'resend', label: 'Resend' },
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'smtp', label: 'SMTP (Custom)' },
];

export function EmailProviderPage() {
  const { data, isLoading } = useEmailProviderConfig();
  const update = useUpdateEmailProvider();
  const testEmail = useSendTestEmail();
  const { toast } = useToast();

  const [provider, setProvider] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (!data?.data) return;
    const d = data.data;
    setProvider(d.emailProvider ?? '');
    if (d.emailConfig) {
      setApiKey(d.emailConfig.apiKey ?? '');
      setSmtpHost(d.emailConfig.smtpHost ?? '');
      setSmtpPort(String(d.emailConfig.smtpPort ?? 587));
      setSmtpSecure(d.emailConfig.smtpSecure ?? false);
      setSmtpUser(d.emailConfig.smtpUser ?? '');
      setSmtpPass(d.emailConfig.smtpPass ?? '');
      setFromEmail(d.emailConfig.fromEmail ?? '');
      setFromName(d.emailConfig.fromName ?? '');
    }
  }, [data]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        emailProvider: (provider || null) as 'resend' | 'sendgrid' | 'smtp' | null,
        emailConfig: provider ? {
          ...(provider === 'resend' || provider === 'sendgrid' ? { apiKey } : {}),
          ...(provider === 'smtp' ? { smtpHost, smtpPort: Number(smtpPort), smtpSecure, smtpUser, smtpPass } : {}),
          fromEmail: fromEmail || undefined,
          fromName: fromName || undefined,
        } : undefined,
      });
      toast('Email settings saved', 'success');
    } catch {
      toast('Failed to save email settings', 'error');
    }
  }

  async function handleTest() {
    if (!testTo) { toast('Enter an email address', 'error'); return; }
    try {
      await testEmail.mutateAsync(testTo);
      toast(`Test email sent to ${testTo}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send test email', 'error');
    }
  }

  if (isLoading) return <div className="text-sm text-zinc-500">Loading...</div>;

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">
      <Card>
        <CardHeader title="Email Provider" />
        <CardContent className="space-y-4">
          <Select
            label="Provider"
            options={PROVIDER_OPTIONS}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />

          {(provider === 'resend' || provider === 'sendgrid') && (
            <Input
              label="API Key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              placeholder={provider === 'resend' ? 're_...' : 'SG...'}
            />
          )}

          {provider === 'smtp' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="SMTP Host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} required placeholder="smtp.gmail.com" />
              <Input label="Port" type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} required />
              <Input label="Username" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="user@example.com" />
              <Input label="Password" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} className="rounded" />
                Use SSL/TLS (port 465)
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {provider && (
        <Card>
          <CardHeader title="Sender Details" />
          <CardContent className="grid grid-cols-2 gap-4">
            <Input label="From Email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="billing@yourcompany.com" />
            <Input label="From Name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your Company Name" />
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={update.isPending}>Save Settings</Button>
      </div>

      {provider && data?.data?.emailProvider && (
        <Card>
          <CardHeader title="Test Configuration" />
          <CardContent>
            <div className="flex gap-2 items-end">
              <Input
                label="Send test email to"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@example.com"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={handleTest} loading={testEmail.isPending}>
                <Send size={14} /> Send Test
              </Button>
            </div>
            {testEmail.isSuccess && (
              <div className="mt-2 flex items-center gap-1 text-sm text-green-600">
                <CheckCircle size={14} /> Test email sent successfully
              </div>
            )}
            {testEmail.isError && (
              <div className="mt-2 flex items-center gap-1 text-sm text-red-600">
                <AlertCircle size={14} /> {testEmail.error instanceof Error ? testEmail.error.message : 'Failed'}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </form>
  );
}
