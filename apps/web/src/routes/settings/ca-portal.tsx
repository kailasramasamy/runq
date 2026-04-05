import { useState } from 'react';
import { Copy, RefreshCw, ExternalLink, CheckCircle } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  useToast,
} from '@/components/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { ApiSuccess } from '@runq/types';

interface CAPortalData {
  slug: string;
  portalUrl: string;
}

function useCAPortal() {
  return useQuery({
    queryKey: ['settings', 'ca-portal'],
    queryFn: () => api.get<ApiSuccess<CAPortalData>>('/settings/ca-portal'),
  });
}

function useRegenerateCAPortal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ApiSuccess<CAPortalData>>('/settings/ca-portal/regenerate', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'ca-portal'] }),
  });
}

export function CAPortalSettingsPage() {
  const { data, isLoading } = useCAPortal();
  const regenerate = useRegenerateCAPortal();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const portalData = data?.data;
  const fullUrl = portalData ? `${window.location.origin}/ca/${portalData.slug}` : '';

  function copyLink() {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast('Link copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    try {
      await regenerate.mutateAsync();
      toast('Portal link regenerated. Previous link will stop working.', 'success');
    } catch {
      toast('Failed to regenerate link', 'error');
    }
  }

  if (isLoading) return <div className="text-sm text-zinc-500">Loading...</div>;

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader title="CA Portal" />
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Share this link with your Chartered Accountant. They get <strong>read-only access</strong> to
            financial reports, trial balance, journal entries, invoice registers, and Tally exports.
            No login required.
          </p>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
            <label className="block text-xs font-medium text-zinc-500 mb-1">Portal Link</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-white px-3 py-2 text-sm font-mono text-zinc-900 border border-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-700 truncate">
                {fullUrl}
              </code>
              <Button variant="outline" size="sm" onClick={copyLink}>
                {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" type="button">
                  <ExternalLink size={14} /> Open
                </Button>
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">What your CA can see:</h4>
            <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside">
              <li>Profit & Loss and Balance Sheet</li>
              <li>Trial Balance (chart of accounts with balances)</li>
              <li>Journal entries with line-item details</li>
              <li>Sales and purchase invoice registers</li>
              <li>Tally XML export (vouchers + ledger masters)</li>
            </ul>
          </div>

          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <Button variant="outline" onClick={handleRegenerate} loading={regenerate.isPending}>
              <RefreshCw size={14} /> Regenerate Link
            </Button>
            <p className="mt-1 text-xs text-zinc-500">
              This will invalidate the current link. Your CA will need the new one.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
