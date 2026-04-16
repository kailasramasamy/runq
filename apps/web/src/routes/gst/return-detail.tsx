import { useState, useEffect } from 'react';
import {
  CheckCircle, Upload, FileCheck, Shield, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import {
  useGstReturn, useValidateReturn, useRequestOtp, useVerifyOtp,
  useUploadReturn, useFileReturn, useGstnSummary, useForceLogout,
} from '@/hooks/queries/use-gst-returns';
import { useCompanySettings } from '@/hooks/queries/use-settings';
import type { GstReturn } from '@/hooks/queries/use-gst-returns';
import { formatINR } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import {
  PageHeader, Button, Card, CardHeader, CardContent, Badge, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  CardSkeleton, useToast, Modal,
} from '@/components/ui';

// ── Helpers ────────────────────────────────────────────────────────────

function periodLabel(period: string): string {
  const month = parseInt(period.substring(0, 2), 10);
  const year = parseInt(period.substring(2), 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${year}`;
}

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  validated: 'warning',
  uploaded: 'warning',
  filed: 'success',
  error: 'danger',
};

const STEPS = ['Generate', 'Validate', 'Authenticate', 'Upload', 'Review', 'File'] as const;
type Step = typeof STEPS[number];

function stepIndex(status: GstReturn['status']): number {
  switch (status) {
    case 'draft': return 0;
    case 'validated': return 2;
    case 'uploaded': return 4;
    case 'filed': return 5;
    case 'error': return 0;
    default: return 0;
  }
}

// ── Section Views ──────────────────────────────────────────────────────

function B2BSection({ data }: { data: any[] }) {
  if (!data?.length) return <p className="text-sm text-zinc-500 px-4 py-6 text-center">No B2B invoices</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Buyer GSTIN</Th>
          <Th>Invoice No</Th>
          <Th>Date</Th>
          <Th className="text-right">Value</Th>
          <Th>POS</Th>
          <Th>RCM</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((inv: any, i: number) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-xs">{inv.buyerGstin}</TableCell>
            <TableCell>
              {inv.invoiceId ? (
                <Link
                  to={'/ar/invoices/$invoiceId' as '/'}
                  params={{ invoiceId: inv.invoiceId }}
                  className="text-primary-600 hover:underline"
                >
                  {inv.invoiceNumber}
                </Link>
              ) : inv.invoiceNumber}
            </TableCell>
            <TableCell className="text-xs">{inv.invoiceDate}</TableCell>
            <TableCell className="text-right">{formatINR(inv.invoiceValue)}</TableCell>
            <TableCell>{inv.placeOfSupply}</TableCell>
            <TableCell>{inv.reverseCharge}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function B2CSSection({ data }: { data: any[] }) {
  if (!data?.length) return <p className="text-sm text-zinc-500 px-4 py-6 text-center">No B2CS entries</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>POS</Th>
          <Th>Type</Th>
          <Th>Rate</Th>
          <Th className="text-right">Taxable</Th>
          <Th className="text-right">IGST</Th>
          <Th className="text-right">CGST</Th>
          <Th className="text-right">SGST</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((e: any, i: number) => (
          <TableRow key={i}>
            <TableCell>{e.placeOfSupply}</TableCell>
            <TableCell>{e.supplyType}</TableCell>
            <TableCell>{e.gstRate}%</TableCell>
            <TableCell className="text-right">{formatINR(e.taxableValue)}</TableCell>
            <TableCell className="text-right">{formatINR(e.igstAmount)}</TableCell>
            <TableCell className="text-right">{formatINR(e.cgstAmount)}</TableCell>
            <TableCell className="text-right">{formatINR(e.sgstAmount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HSNSection({ data }: { data: any[] }) {
  if (!data?.length) return <p className="text-sm text-zinc-500 px-4 py-6 text-center">No HSN data</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>HSN</Th>
          <Th>Description</Th>
          <Th>UQC</Th>
          <Th className="text-right">Qty</Th>
          <Th className="text-right">Taxable</Th>
          <Th>Rate</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((h: any, i: number) => (
          <TableRow key={i}>
            <TableCell className="font-mono">{h.hsnCode}</TableCell>
            <TableCell className="text-xs">{h.description}</TableCell>
            <TableCell>{h.uqc}</TableCell>
            <TableCell className="text-right">{h.totalQuantity}</TableCell>
            <TableCell className="text-right">{formatINR(h.taxableValue)}</TableCell>
            <TableCell>{h.gstRate}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CDNSection({ data }: { data: any[] }) {
  if (!data?.length) return <p className="text-sm text-zinc-500 px-4 py-6 text-center">No credit/debit notes</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Buyer GSTIN</Th>
          <Th>Note No</Th>
          <Th>Type</Th>
          <Th>Date</Th>
          <Th className="text-right">Value</Th>
          <Th>Orig Invoice</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((n: any, i: number) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-xs">{n.buyerGstin}</TableCell>
            <TableCell>
              {n.creditNoteId ? (
                <Link
                  to={'/ar/credit-notes/$creditNoteId' as '/'}
                  params={{ creditNoteId: n.creditNoteId }}
                  className="text-primary-600 hover:underline"
                >
                  {n.noteNumber}
                </Link>
              ) : n.noteNumber}
            </TableCell>
            <TableCell>{n.noteType === 'C' ? 'Credit' : 'Debit'}</TableCell>
            <TableCell className="text-xs">{n.noteDate}</TableCell>
            <TableCell className="text-right">{formatINR(n.noteValue)}</TableCell>
            <TableCell className="text-xs">{n.originalInvoiceNumber}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export function GstReturnDetailPage({ returnId }: { returnId: string }) {
  const { toast } = useToast();
  const { data: returnData, isLoading } = useGstReturn(returnId);
  const validateMutation = useValidateReturn();
  const requestOtpMutation = useRequestOtp();
  const verifyOtpMutation = useVerifyOtp();
  const uploadMutation = useUploadReturn();
  const fileMutation = useFileReturn();
  const forceLogoutMutation = useForceLogout();
  const { data: companyData } = useCompanySettings();

  const [activeTab, setActiveTab] = useState<'b2b' | 'b2cs' | 'b2cl' | 'cdn' | 'hsn' | 'docs'>('b2b');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [gstUsername, setGstUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [txn, setTxn] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [showEvcModal, setShowEvcModal] = useState(false);
  const [evc, setEvc] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);

  const ret = returnData?.data;
  const { data: summaryData } = useGstnSummary(returnId, ret?.status === 'uploaded');

  // Auto-populate GST username from company settings
  useEffect(() => {
    if (companyData?.data?.gstUsername && !gstUsername) {
      setGstUsername(companyData.data.gstUsername);
    }
  }, [companyData, gstUsername]);

  if (isLoading) return <CardSkeleton />;
  if (!ret) return <p className="text-zinc-500">Return not found</p>;

  const data = ret.data as any;
  const currentStep = stepIndex(ret.status);

  const TABS = [
    { key: 'b2b', label: 'B2B', count: data?.b2b?.length ?? 0 },
    { key: 'b2cs', label: 'B2CS', count: data?.b2cs?.length ?? 0 },
    { key: 'b2cl', label: 'B2CL', count: data?.b2cl?.length ?? 0 },
    { key: 'cdn', label: 'CDN', count: data?.cdn?.length ?? 0 },
    { key: 'hsn', label: 'HSN', count: data?.hsn?.length ?? 0 },
    { key: 'docs', label: 'Docs', count: data?.docs?.length ?? 0 },
  ] as const;

  function handleValidate() {
    validateMutation.mutate(returnId, {
      onSuccess: (res: any) => {
        if (res.data.valid) {
          toast('Validation passed', 'success');
        } else {
          toast(`${res.data.errors.length} validation error(s) found`, 'error');
        }
      },
      onError: (err: any) => toast(err?.message ?? 'Validation failed', 'error'),
    });
  }

  function handleRequestOtp() {
    if (!gstUsername) { toast('Enter GST portal username', 'error'); return; }
    setSessionError(null);
    requestOtpMutation.mutate(
      { gstin: ret!.gstin, username: gstUsername },
      {
        onSuccess: (res: any) => {
          if (!res.data.success || !res.data.txn) {
            const msg = res.data.message ?? 'Failed to request OTP from GST portal';
            setSessionError(msg);
            toast(msg, 'error');
            return;
          }
          setTxn(res.data.txn);
          toast('OTP sent to your registered mobile', 'success');
        },
        onError: (err: any) => toast(err?.message ?? 'Failed to request OTP', 'error'),
      },
    );
  }

  function handleForceLogout() {
    if (!gstUsername) { toast('Enter GST portal username first', 'error'); return; }
    forceLogoutMutation.mutate(
      { gstin: ret!.gstin, username: gstUsername },
      {
        onSuccess: (res: any) => {
          toast(res.data.success ? 'Session cleared. Try OTP again.' : `Logout: ${res.data.message}`, res.data.success ? 'success' : 'error');
          setSessionError(null);
          setTxn('');
        },
        onError: (err: any) => toast(err?.message ?? 'Force logout failed', 'error'),
      },
    );
  }

  function handleVerifyOtp() {
    if (!otp) { toast('Enter the OTP', 'error'); return; }
    verifyOtpMutation.mutate(
      { gstin: ret!.gstin, username: gstUsername, otp, txn },
      {
        onSuccess: () => {
          setAuthenticated(true);
          setShowOtpModal(false);
          toast('Authenticated with GST portal', 'success');
        },
        onError: (err: any) => toast(err?.message ?? 'OTP verification failed', 'error'),
      },
    );
  }

  function handleUpload() {
    uploadMutation.mutate(returnId, {
      onSuccess: (res: any) => {
        if (res.data.success) toast('Uploaded to GSTN', 'success');
        else toast('Upload failed — check errors', 'error');
      },
      onError: (err: any) => toast(err?.message ?? 'Upload failed', 'error'),
    });
  }

  function handleFile() {
    if (!evc) { toast('Enter the EVC', 'error'); return; }
    fileMutation.mutate(
      { id: returnId, evc },
      {
        onSuccess: (res: any) => {
          setShowEvcModal(false);
          if (res.data.success) toast(`Filed successfully! ARN: ${res.data.arn}`, 'success');
          else toast('Filing failed', 'error');
        },
        onError: (err: any) => toast(err?.message ?? 'Filing failed', 'error'),
      },
    );
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`${ret.returnType.toUpperCase()} — ${periodLabel(ret.period)}`}
        breadcrumbs={[
          { label: 'GST Returns', href: '/gst/returns' },
          { label: periodLabel(ret.period) },
        ]}
        actions={
          <Badge variant={STATUS_COLORS[ret.status] ?? 'default'} className="text-sm">
            {ret.status.toUpperCase()}
          </Badge>
        }
      />

      {/* ── Step Progress ── */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div className={[
              'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
              i < currentStep ? 'bg-green-500 text-white' :
              i === currentStep ? 'bg-primary-500 text-white' :
              'bg-zinc-200 dark:bg-zinc-700 text-zinc-500',
            ].join(' ')}>
              {i < currentStep ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={[
              'text-xs whitespace-nowrap',
              i <= currentStep ? 'text-zinc-900 dark:text-zinc-100 font-medium' : 'text-zinc-400',
            ].join(' ')}>{step}</span>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-zinc-300 dark:bg-zinc-600" />}
          </div>
        ))}
      </div>

      {/* ── Error details ── */}
      {ret.errorDetails && ret.errorDetails.length > 0 && (
        <Card className="mb-4 border-red-200 dark:border-red-800">
          <CardHeader title="Validation Errors" />
          <CardContent>
            <ul className="space-y-1">
              {ret.errorDetails.map((e, i) => (
                <li key={i} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span><strong>{e.section}:</strong> {e.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Filed success ── */}
      {ret.status === 'filed' && ret.arn && (
        <Card className="mb-4 border-green-200 dark:border-green-800">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-400">
                Filed successfully
              </p>
              <p className="text-sm text-zinc-500">
                ARN: <span className="font-mono">{ret.arn}</span>
                {ret.filedAt && ` — ${new Date(ret.filedAt).toLocaleString('en-IN')}`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Action buttons ── */}
      {ret.status !== 'filed' && (
        <div className="flex gap-3 mb-6">
          {ret.status === 'draft' && (
            <Button onClick={handleValidate} disabled={validateMutation.isPending}>
              <Shield className="h-4 w-4 mr-2" />
              {validateMutation.isPending ? 'Validating...' : 'Validate'}
            </Button>
          )}
          {ret.status === 'validated' && !authenticated && (
            <Button onClick={() => setShowOtpModal(true)}>
              <Shield className="h-4 w-4 mr-2" /> Authenticate with GST Portal
            </Button>
          )}
          {ret.status === 'validated' && authenticated && (
            <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
              <Upload className="h-4 w-4 mr-2" />
              {uploadMutation.isPending ? 'Uploading...' : 'Upload to GSTN'}
            </Button>
          )}
          {ret.status === 'uploaded' && (
            <Button onClick={() => setShowEvcModal(true)}>
              <FileCheck className="h-4 w-4 mr-2" /> File with EVC
            </Button>
          )}
          {ret.status === 'error' && (
            <Button onClick={handleValidate} variant="outline">
              Re-validate
            </Button>
          )}
        </div>
      )}

      {/* ── Section tabs ── */}
      <Card>
        <div className="border-b border-zinc-200 dark:border-zinc-700">
          <nav className="flex gap-1 overflow-x-auto px-4 pt-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={[
                  'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                  activeTab === tab.key
                    ? 'border-primary-500 text-primary-500'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
                ].join(' ')}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </nav>
        </div>
        <CardContent className="p-0">
          {activeTab === 'b2b' && <B2BSection data={data?.b2b} />}
          {activeTab === 'b2cs' && <B2CSSection data={data?.b2cs} />}
          {activeTab === 'b2cl' && <B2BSection data={data?.b2cl} />}
          {activeTab === 'cdn' && <CDNSection data={data?.cdn} />}
          {activeTab === 'hsn' && <HSNSection data={data?.hsn} />}
          {activeTab === 'docs' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Document Type</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th className="text-right">Issued</Th>
                  <Th className="text-right">Cancelled</Th>
                  <Th className="text-right">Net</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.docs ?? []).map((d: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{d.docType}</TableCell>
                    <TableCell className="font-mono text-xs">{d.fromSerial}</TableCell>
                    <TableCell className="font-mono text-xs">{d.toSerial}</TableCell>
                    <TableCell className="text-right">{d.totalIssued}</TableCell>
                    <TableCell className="text-right">{d.totalCancelled}</TableCell>
                    <TableCell className="text-right">{d.netIssued}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── GSTN Summary (after upload) ── */}
      {summaryData?.data && (
        <Card className="mt-4">
          <CardHeader title="GSTN Summary (from portal)" />
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-zinc-500">B2B Invoices</p>
                <p className="font-medium">{summaryData.data.b2b.count}</p>
              </div>
              <div>
                <p className="text-zinc-500">B2B Taxable Value</p>
                <p className="font-medium">{formatINR(summaryData.data.b2b.taxableValue)}</p>
              </div>
              <div>
                <p className="text-zinc-500">CDN Count</p>
                <p className="font-medium">{summaryData.data.cdn.count}</p>
              </div>
              <div>
                <p className="text-zinc-500">HSN Entries</p>
                <p className="font-medium">{summaryData.data.hsn.count}</p>
              </div>
              <div>
                <p className="text-zinc-500">Documents</p>
                <p className="font-medium">{summaryData.data.docs.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── OTP Modal ── */}
      <Modal open={showOtpModal} title="Authenticate with GST Portal" onClose={() => setShowOtpModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">GSTIN</label>
            <Input value={ret.gstin} disabled />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">GST Portal Username</label>
            <Input
              value={gstUsername}
              onChange={(e) => setGstUsername(e.target.value)}
              placeholder="Your GST portal username"
            />
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
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                />
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

      {/* ── EVC Modal ── */}
      <Modal open={showEvcModal} title="File Return" onClose={() => setShowEvcModal(false)}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            An EVC (Electronic Verification Code) will be sent to your registered mobile. Enter it below to file the return.
          </p>
          <div>
            <label className="text-sm font-medium block mb-1">EVC Code</label>
            <Input
              value={evc}
              onChange={(e) => setEvc(e.target.value)}
              placeholder="Enter EVC"
              maxLength={6}
            />
          </div>
          <Button onClick={handleFile} disabled={fileMutation.isPending} className="w-full">
            {fileMutation.isPending ? 'Filing...' : 'File Return'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
