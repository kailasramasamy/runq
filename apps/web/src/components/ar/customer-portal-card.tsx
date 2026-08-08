import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ar/primitives';

export function PortalLinkCard({ customerId, nickname }: { customerId: string; nickname: string | null }) {
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function buildUrl(slug: string) {
    // Canonical share URL — `/portal/<slug>`. The legacy `/portal/s/<slug>`
    // shape still routes to the same page so any link sent before the
    // rename keeps working.
    return `${window.location.origin}/portal/${slug}`;
  }

  const generateToken = useMutation({
    mutationFn: () => api.post<{ data: { slug: string } }>(`/ar/customers/${customerId}/portal-token`),
    onSuccess: (res) => {
      setPortalUrl(buildUrl(res.data.slug));
    },
  });

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: { slug: string | null } }>(`/ar/customers/${customerId}/portal-slug`)
      .then((res) => {
        if (!cancelled && res.data.slug) setPortalUrl(buildUrl(res.data.slug));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  function handleCopy() {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
          Payment portal
        </div>
        <ExternalLink size={13} style={{ color: 'var(--text-3)' }} />
      </div>
      <p className="mb-3 text-[12px]" style={{ color: 'var(--text-2)' }}>
        Share this link so {nickname || 'the customer'} can view and pay invoices online.
      </p>
      {portalUrl ? (
        <>
          <div
            className="num mb-2 truncate rounded-md border px-2.5 py-2 text-[11px]"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {portalUrl}
          </div>
          <div className="mb-3 flex items-center gap-1.5">
            <Button size="sm" variant="outline" icon={copied ? <Check size={12} /> : <Copy size={12} />} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => generateToken.mutate()} loading={generateToken.isPending}>
              Regenerate
            </Button>
          </div>
          <PortalPinControl customerId={customerId} />
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          icon={<ExternalLink size={12} />}
          onClick={() => generateToken.mutate()}
          loading={generateToken.isPending}
        >
          Generate portal link
        </Button>
      )}
    </div>
  );
}

function PortalPinControl({ customerId }: { customerId: string }) {
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

  function copyPin() {
    if (!pin) return;
    navigator.clipboard.writeText(pin);
    setPinCopied(true);
    setTimeout(() => setPinCopied(false), 2000);
  }

  useEffect(() => {
    api
      .get<{ data: { isSet: boolean; pin: string | null } }>(`/ar/customers/${customerId}/portal-pin-status`)
      .then((res) => {
        setIsSet(res.data.isSet);
        setPin(res.data.pin);
      })
      .catch(() => setIsSet(false));
  }, [customerId]);

  async function generatePin() {
    setBusy(true);
    try {
      const res = await api.post<{ data: { pin: string } }>(`/ar/customers/${customerId}/portal-pin`);
      setPin(res.data.pin);
      setIsSet(true);
    } finally {
      setBusy(false);
    }
  }

  async function clearPin() {
    if (!confirm('Remove portal PIN? Anyone with the link will be able to view invoices.')) return;
    setBusy(true);
    try {
      await api.delete(`/ar/customers/${customerId}/portal-pin`);
      setIsSet(false);
      setPin(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
          Portal PIN
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: isSet ? '#dcfce7' : '#fef3c7',
            color: isSet ? '#15803d' : '#a16207',
          }}
        >
          {isSet === null ? '…' : isSet ? 'Required' : 'Not set'}
        </span>
      </div>
      {pin ? (
        <>
          <p className="mb-1 text-[11px]" style={{ color: 'var(--text-2)' }}>
            Share this PIN with the customer:
          </p>
          <div className="mb-3 flex items-center gap-2">
            <code
              className="num rounded-md border px-3 py-1.5 font-mono text-base tracking-widest"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              {pin}
            </code>
            <Button
              size="sm"
              variant="outline"
              icon={pinCopied ? <Check size={12} /> : <Copy size={12} />}
              onClick={copyPin}
            >
              {pinCopied ? 'Copied' : 'Copy PIN'}
            </Button>
          </div>
        </>
      ) : (
        <p className="mb-2 text-[11px]" style={{ color: 'var(--text-2)' }}>
          No PIN required — anyone with the link can view invoices. Generate one to protect this portal.
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={generatePin} loading={busy}>
          {isSet ? 'Generate new PIN' : 'Generate PIN'}
        </Button>
        {isSet && (
          <Button size="sm" variant="outline" onClick={clearPin} disabled={busy}>
            Remove PIN
          </Button>
        )}
      </div>
    </div>
  );
}
