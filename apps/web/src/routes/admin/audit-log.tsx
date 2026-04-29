import { useEffect, useState } from 'react';
import { PageHeader, Card, CardContent, Table, TableHeader, TableBody, TableRow, TableCell, Th, Skeleton, Pagination } from '@/components/ui';
import { api } from '@/lib/api-client';

interface AuditRow {
  id: string;
  platformUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetTenantId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditResponse {
  data: { rows: AuditRow[]; total: number; limit: number; offset: number };
}

const PAGE_SIZE = 50;

export function AdminAuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<AuditResponse>(`/admin/audit-log?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`)
      .then((res) => {
        if (cancelled) return;
        setRows(res.data.rows);
        setTotal(res.data.total);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="Every platform admin action is recorded here" />
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">No audit entries yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Target</Th>
                  <Th>IP</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-zinc-500">
                      {new Date(r.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{r.actorName ?? '—'}</div>
                      <div className="text-xs text-zinc-500">{r.actorEmail ?? r.platformUserId ?? '—'}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.action}</TableCell>
                    <TableCell className="text-xs">
                      <div>{r.targetType}</div>
                      <div className="text-zinc-500">{r.targetId ?? r.targetTenantId ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">{r.ipAddress ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={Math.ceil(total / PAGE_SIZE)}
          total={total}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
