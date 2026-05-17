import { useState, useEffect } from 'react';
import { CheckCircle, Upload, FileCheck, Shield, AlertTriangle } from 'lucide-react';
import {
  useGstReturn, useValidateReturn, useRequestOtp, useVerifyOtp,
  useUpload3b, useFileReturn, useAutoPopulated3b, useForceLogout, useRequestEvcOtp,
} from '@/hooks/queries/use-gst-returns';
import { useCompanySettings } from '@/hooks/queries/use-settings';
import type { GstReturn } from '@/hooks/queries/use-gst-returns';
import { formatINR } from '@/lib/utils';
import {
  Button, Card, CardHeader, CardContent, Badge, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  CardSkeleton, useToast, Modal,
} from '@/components/ui';
import { PageHeader } from '@/components/ar/primitives';

function periodLabel(period: string): string {
  const month = parseInt(period.substring(0, 2), 10);
  const year = parseInt(period.substring(2), 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${year}`;
}

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  draft: 'default', validated: 'warning', uploaded: 'warning', filed: 'success', error: 'danger',
};

// ── Tax amount row helper ──────────────────────────────────────────────

function TaxRow({ label, igst, cgst, sgst, cess }: {
  label: string; igst?: number; cgst?: number; sgst?: number; cess?: number;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-right">{igst != null ? formatINR(igst) : '—'}</TableCell>
      <TableCell className="text-right">{cgst != null ? formatINR(cgst) : '—'}</TableCell>
      <TableCell className="text-right">{sgst != null ? formatINR(sgst) : '—'}</TableCell>
      <TableCell className="text-right">{cess != null ? formatINR(cess) : '—'}</TableCell>
    </TableRow>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function Gstr3bDetailPage({ returnId }: { returnId: string }) {
  const { toast } = useToast();
  const { data: returnData, isLoading } = useGstReturn(returnId);
  const validateMutation = useValidateReturn();
  const requestOtpMutation = useRequestOtp();
  const verifyOtpMutation = useVerifyOtp();
  const uploadMutation = useUpload3b();
  const fileMutation = useFileReturn();
  const requestEvcMutation = useRequestEvcOtp();
  const forceLogoutMutation = useForceLogout();
  const { data: companyData } = useCompanySettings();

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [gstUsername, setGstUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [txn, setTxn] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [showEvcModal, setShowEvcModal] = useState(false);
  const [evc, setEvc] = useState('');
  // Two-stage EVC flow: stage 1 is the explicit Send-OTP click; only
  // after that do we reveal the OTP field + File button. Without this
  // gate the modal looked like all three actions were peers and users
  // sat waiting for an OTP they never asked for.
  const [evcOtpSent, setEvcOtpSent] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const ret = returnData?.data;
  const { data: autoData } = useAutoPopulated3b(returnId, ret?.status === 'uploaded');

  useEffect(() => {
    if (companyData?.data?.gstUsername && !gstUsername) {
      setGstUsername(companyData.data.gstUsername);
    }
  }, [companyData, gstUsername]);

  if (isLoading) return <CardSkeleton />;
  if (!ret) return <p className="text-zinc-500">Return not found</p>;

  const d = ret.data as any;

  function handleValidate() {
    // 3B validation is lighter — just mark as validated if data exists
    if (!d) { toast('No data to validate', 'error'); return; }
    validateMutation.mutate(returnId, {
      onSuccess: () => toast('Validated', 'success'),
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  function handleRequestOtp() {
    if (!gstUsername) { toast('Enter GST portal username', 'error'); return; }
    setSessionError(null);
    requestOtpMutation.mutate({ gstin: ret!.gstin, username: gstUsername }, {
      onSuccess: (res: any) => {
        if (!res.data.success || !res.data.txn) {
          const msg = res.data.message ?? 'Failed to request OTP';
          setSessionError(msg);
          toast(msg, 'error');
          return;
        }
        setTxn(res.data.txn);
        toast('OTP sent', 'success');
      },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  function handleForceLogout() {
    if (!gstUsername) { toast('Enter GST portal username first', 'error'); return; }
    forceLogoutMutation.mutate({ gstin: ret!.gstin, username: gstUsername }, {
      onSuccess: (res: any) => {
        toast(res.data.success ? 'Session cleared. Try OTP again.' : `Logout: ${res.data.message}`, res.data.success ? 'success' : 'error');
        setSessionError(null);
        setTxn('');
      },
      onError: (err: any) => toast(err?.message ?? 'Force logout failed', 'error'),
    });
  }

  function handleVerifyOtp() {
    if (!otp) { toast('Enter OTP', 'error'); return; }
    verifyOtpMutation.mutate({ gstin: ret!.gstin, username: gstUsername, otp, txn }, {
      onSuccess: () => { setAuthenticated(true); setShowOtpModal(false); toast('Authenticated', 'success'); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  function handleUpload() {
    uploadMutation.mutate(returnId, {
      onSuccess: (res: any) => toast(res.data.success ? 'Uploaded to GSTN' : 'Upload failed', res.data.success ? 'success' : 'error'),
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  function handleFile() {
    if (!evc) { toast('Enter EVC', 'error'); return; }
    fileMutation.mutate({ id: returnId, evc }, {
      onSuccess: (res: any) => { setShowEvcModal(false); toast(res.data.success ? `Filed! ARN: ${res.data.arn}` : 'Failed', res.data.success ? 'success' : 'error'); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`GSTR-3B — ${periodLabel(ret.period)}`}
        breadcrumbs={[
          { label: 'GST Returns', href: '/gst/returns' },
          { label: `3B — ${periodLabel(ret.period)}` },
        ]}
        actions={
          <Badge variant={STATUS_COLORS[ret.status] ?? 'default'} className="text-sm">
            {ret.status.toUpperCase()}
          </Badge>
        }
      />

      {/* Filed success */}
      {ret.status === 'filed' && ret.arn && (
        <Card className="mb-4 border-green-200 dark:border-green-800">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-400">Filed successfully</p>
              <p className="text-sm text-zinc-500">ARN: <span className="font-mono">{ret.arn}</span></p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error details */}
      {ret.errorDetails && ret.errorDetails.length > 0 && (
        <Card className="mb-4 border-red-200 dark:border-red-800">
          <CardContent className="py-3">
            {ret.errorDetails.map((e, i) => (
              <p key={i} className="text-sm text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> {e.message}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      {ret.status !== 'filed' && (
        <div className="flex gap-3 mb-6">
          {ret.status === 'draft' && (
            <Button onClick={handleValidate} disabled={validateMutation.isPending}>
              <Shield className="h-4 w-4 mr-2" /> Validate
            </Button>
          )}
          {ret.status === 'validated' && !authenticated && (
            <Button onClick={() => setShowOtpModal(true)}><Shield className="h-4 w-4 mr-2" /> Authenticate</Button>
          )}
          {ret.status === 'validated' && authenticated && (
            <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
              <Upload className="h-4 w-4 mr-2" /> Upload to GSTN
            </Button>
          )}
          {ret.status === 'uploaded' && (
            <Button onClick={() => setShowEvcModal(true)}><FileCheck className="h-4 w-4 mr-2" /> File with EVC</Button>
          )}
        </div>
      )}

      {/* Table 3.1: Outward Supplies */}
      <Card className="mb-4">
        <CardHeader title="3.1 — Outward Supplies" />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Description</Th>
                <Th className="text-right">Taxable Value</Th>
                <Th className="text-right">IGST</Th>
                <Th className="text-right">CGST</Th>
                <Th className="text-right">SGST</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Outward taxable (inter-state)</TableCell>
                <TableCell className="text-right">{formatINR(d?.table31?.outwardTaxableInterState?.taxableValue ?? 0)}</TableCell>
                <TableCell className="text-right">{formatINR(d?.table31?.outwardTaxableInterState?.igst ?? 0)}</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Outward taxable (intra-state)</TableCell>
                <TableCell className="text-right">{formatINR(d?.table31?.outwardTaxableIntraState?.taxableValue ?? 0)}</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">{formatINR(d?.table31?.outwardTaxableIntraState?.cgst ?? 0)}</TableCell>
                <TableCell className="text-right">{formatINR(d?.table31?.outwardTaxableIntraState?.sgst ?? 0)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Zero-rated supplies</TableCell>
                <TableCell className="text-right">{formatINR(d?.table31?.zeroRatedSupplies?.taxableValue ?? 0)}</TableCell>
                <TableCell className="text-right">{formatINR(d?.table31?.zeroRatedSupplies?.igst ?? 0)}</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Nil-rated / Exempt</TableCell>
                <TableCell className="text-right">{formatINR(d?.table31?.nilRatedExempt?.taxableValue ?? 0)}</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Table 4: ITC */}
      <Card className="mb-4">
        <CardHeader title="4 — Input Tax Credit" action={
          <Badge variant={ret.notes?.includes('GSTR-2B') ? 'success' : 'default'} className="text-xs">
            {ret.notes?.includes('GSTR-2B') ? 'Source: GSTR-2B' : 'Source: Purchase Invoices'}
          </Badge>
        } />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Description</Th>
                <Th className="text-right">IGST</Th>
                <Th className="text-right">CGST</Th>
                <Th className="text-right">SGST</Th>
                <Th className="text-right">Cess</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TaxRow label="Import of goods" {...(d?.table4?.itcAvailable?.importGoods ?? {})} />
              <TaxRow label="Import of services" {...(d?.table4?.itcAvailable?.importServices ?? {})} />
              <TaxRow label="Inward (reverse charge)" {...(d?.table4?.itcAvailable?.inwardReverseCharge ?? {})} />
              <TaxRow label="ISD" {...(d?.table4?.itcAvailable?.isd ?? {})} />
              <TaxRow label="All other ITC" {...(d?.table4?.itcAvailable?.allOtherItc ?? {})} />
              <TableRow className="bg-zinc-50 dark:bg-zinc-800/50 font-medium">
                <TableCell>Net ITC Available</TableCell>
                <TableCell className="text-right">{formatINR(d?.table4?.netItc?.igst ?? 0)}</TableCell>
                <TableCell className="text-right">{formatINR(d?.table4?.netItc?.cgst ?? 0)}</TableCell>
                <TableCell className="text-right">{formatINR(d?.table4?.netItc?.sgst ?? 0)}</TableCell>
                <TableCell className="text-right">{formatINR(d?.table4?.netItc?.cess ?? 0)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Table 6.1: Tax Liability */}
      <Card className="mb-4">
        <CardHeader title="6.1 — Tax Liability & Payment" />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Tax</Th>
                <Th className="text-right">Payable</Th>
                <Th className="text-right">ITC Used</Th>
                <Th className="text-right">Cash to Pay</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {['igst', 'cgst', 'sgst', 'cess'].map((tax) => {
                const t = d?.table61?.[tax] ?? { payable: 0, itcUsed: 0, cashPaid: 0 };
                return (
                  <TableRow key={tax}>
                    <TableCell className="font-medium">{tax.toUpperCase()}</TableCell>
                    <TableCell className="text-right">{formatINR(t.payable)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatINR(t.itcUsed)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatINR(t.cashPaid)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-zinc-50 dark:bg-zinc-800/50 font-bold">
                <TableCell>Total Cash to Pay</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right text-lg">
                  {formatINR(
                    (d?.table61?.igst?.cashPaid ?? 0) +
                    (d?.table61?.cgst?.cashPaid ?? 0) +
                    (d?.table61?.sgst?.cashPaid ?? 0) +
                    (d?.table61?.cess?.cashPaid ?? 0)
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* OTP Modal */}
      <Modal open={showOtpModal} title="Authenticate with GST Portal" onClose={() => setShowOtpModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">GSTIN</label>
            <Input value={ret.gstin} disabled />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">GST Portal Username</label>
            <Input value={gstUsername} onChange={(e) => setGstUsername(e.target.value)} placeholder="Your GST portal username" />
          </div>
          {!txn ? (
            <>
              {requestOtpMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-md px-3 py-2">
                  <div className="h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span>Requesting OTP from GST portal... this may take a few seconds</span>
                </div>
              )}
              {sessionError && (
                <div className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-2 space-y-2">
                  <p><strong>GST Portal:</strong> {sessionError}</p>
                  {sessionError.toLowerCase().includes('session') && (
                    <Button
                      onClick={handleForceLogout}
                      disabled={forceLogoutMutation.isPending}
                      variant="outline"
                      className="w-full"
                    >
                      {forceLogoutMutation.isPending ? 'Clearing...' : 'Clear Stuck Session'}
                    </Button>
                  )}
                </div>
              )}
              <Button onClick={handleRequestOtp} disabled={requestOtpMutation.isPending} className="w-full">
                {requestOtpMutation.isPending ? 'Sending...' : 'Send OTP'}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-3 py-2">
                <span>✓ OTP sent to your registered mobile. Enter it below.</span>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">OTP</label>
                <Input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter 6-digit OTP" maxLength={6} />
              </div>
              {verifyOtpMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-md px-3 py-2">
                  <div className="h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span>Verifying OTP with GSTN...</span>
                </div>
              )}
              <Button onClick={handleVerifyOtp} disabled={verifyOtpMutation.isPending} className="w-full">
                {verifyOtpMutation.isPending ? 'Verifying...' : 'Verify OTP'}
              </Button>
            </>
          )}
        </div>
      </Modal>

      {/* EVC Modal — staged flow so the required first action (Send OTP)
          isn't visually peer to "Enter EVC" / "File". Stage 1 = only the
          big primary Send button. Stage 2 (after success) = OTP entry +
          File button. */}
      <Modal
        open={showEvcModal}
        title="File GSTR-3B"
        onClose={() => { setShowEvcModal(false); setEvcOtpSent(false); setEvc(''); }}
      >
        <div className="space-y-4">
          {!evcOtpSent ? (
            <>
              <p className="text-sm text-zinc-500">
                To file this return, GSTN will send a one-time EVC code to the authorized signatory's
                registered mobile and email. Click below to request it.
              </p>
              {requestEvcMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-md px-3 py-2">
                  <div className="h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span>Requesting EVC from GST portal…</span>
                </div>
              )}
              <Button
                onClick={() => requestEvcMutation.mutate(returnId, {
                  onSuccess: (res: any) => {
                    const ok = !!res?.data?.success;
                    toast(res?.data?.message ?? (ok ? 'EVC OTP sent' : 'Failed to send EVC OTP'), ok ? 'success' : 'error');
                    if (ok) setEvcOtpSent(true);
                  },
                  onError: (e: any) => toast(e?.message ?? 'Failed to send EVC', 'error'),
                })}
                disabled={requestEvcMutation.isPending}
                className="w-full"
              >
                {requestEvcMutation.isPending ? 'Sending…' : 'Send EVC OTP'}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-3 py-2">
                <span>✓ EVC sent to the authorized signatory's registered mobile and email. Enter the 6-digit code below.</span>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">EVC Code</label>
                <Input value={evc} onChange={(e) => setEvc(e.target.value)} placeholder="Enter 6-digit EVC" maxLength={6} autoFocus />
              </div>
              <Button onClick={handleFile} disabled={fileMutation.isPending || evc.length < 6} className="w-full">
                {fileMutation.isPending ? 'Filing…' : 'File GSTR-3B'}
              </Button>
              <button
                type="button"
                onClick={() => requestEvcMutation.mutate(returnId, {
                  onSuccess: (res: any) => toast(res?.data?.message ?? 'EVC resent', res?.data?.success ? 'success' : 'error'),
                  onError: (e: any) => toast(e?.message ?? 'Failed to resend', 'error'),
                })}
                disabled={requestEvcMutation.isPending}
                className="text-xs text-primary-600 hover:underline disabled:opacity-50"
              >
                Didn't get it? Resend EVC
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
