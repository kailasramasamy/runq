// Smoke suite — sign in as each persona and walk the HR endpoints any
// mobile/web client would hit on first paint. Catches regressions in
// auth wiring, role-based scoping, and response shape without booting
// a Flutter simulator.
//
// Defaults match the current dev DB (Vrindavan tenant for OTP-side
// personas, runq-demo for the admin login). Override via env vars to
// point at a staging API or a CI-seeded fixture set.
//
// Run with: `pnpm --filter @runq/api test smoke`

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.API_BASE || 'http://localhost:3003/api/v1';

interface Persona {
  label: string;
  signIn: () => Promise<{ token: string; tenantId: string; role: string }>;
  /// Minimum number of employees this persona should see via /hr/employees.
  /// Admin: org-wide (large); manager: own + reports (>=2); employee: self (>=1).
  minScope: number;
  /// True when the persona has a direct employee record — `/hr/me/payslips`,
  /// `/hr/leave-requests?employeeId=self` etc. are meaningful only then.
  hasEmployeeRow: boolean;
}

async function http(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function signInWithEmail(email: string, password: string, tenant?: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenant }),
  });
  if (!res.ok) throw new Error(`Email login failed (${res.status}) for ${email}`);
  const data = await res.json();
  const d = data.data ?? data;
  return { token: d.token as string, tenantId: d.user?.tenantId as string, role: d.user?.role as string };
}

async function signInWithOtp(phone: string, otp = '123456') {
  const res = await fetch(`${API_BASE}/auth/phone-otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OTP login failed (${res.status}) for ${phone}: ${txt}`);
  }
  const data = await res.json();
  const d = data.data;
  return { token: d.token as string, tenantId: d.user.tenantId as string, role: d.user.role as string };
}

const personas: Persona[] = [
  {
    label: 'admin (owner)',
    signIn: () => signInWithEmail(
      process.env.TEST_ADMIN_EMAIL || 'appreview@runq.in',
      process.env.TEST_ADMIN_PASSWORD || 'AppleReview2026!',
      process.env.TEST_ADMIN_TENANT || 'runq-demo',
    ),
    minScope: 1,
    hasEmployeeRow: false,
  },
  {
    label: 'manager (Ramesh)',
    signIn: () => signInWithOtp(process.env.TEST_MANAGER_PHONE || '9876543210'),
    // Ramesh + 3 reports = 4.
    minScope: 2,
    hasEmployeeRow: true,
  },
  {
    label: 'employee (Lakshmi)',
    signIn: () => signInWithOtp(process.env.TEST_EMPLOYEE_PHONE || '9876543221'),
    minScope: 1,
    hasEmployeeRow: true,
  },
];

// Sanity-check that the API is reachable before kicking off the suite —
// a refused connection inside every `it` block is harder to read than
// one failure at the top.
beforeAll(async () => {
  try {
    const res = await fetch(`${API_BASE.replace('/api/v1', '')}/health`);
    if (!res.ok) throw new Error(`/health returned ${res.status}`);
  } catch (e) {
    throw new Error(
      `API not reachable at ${API_BASE}. Start the API with \`pnpm --filter @runq/api dev\` first. (${(e as Error).message})`,
    );
  }
});

for (const p of personas) {
  describe(`HR endpoints — ${p.label}`, () => {
    let token = '';
    let tenantId = '';
    let role = '';
    let selfEmployeeId: string | null = null;

    beforeAll(async () => {
      const session = await p.signIn();
      token = session.token;
      tenantId = session.tenantId;
      role = session.role;
      expect(token).toBeTruthy();
      expect(tenantId).toBeTruthy();
      expect(role).toBeTruthy();
    });

    it('GET /hr/me — resolves user, returns systemRole', async () => {
      const r = await http(token, 'GET', '/hr/me');
      expect(r.status).toBe(200);
      expect(r.body?.data?.systemRole).toBeTruthy();
      if (p.hasEmployeeRow) {
        expect(r.body.data.employee?.id).toBeTruthy();
        selfEmployeeId = r.body.data.employee.id;
      }
    });

    it('GET /hr/employees — respects access scope', async () => {
      const r = await http(token, 'GET', '/hr/employees?page=1&limit=50');
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body?.data)).toBe(true);
      expect(r.body.data.length).toBeGreaterThanOrEqual(p.minScope);
    });

    it('GET /hr/directory — org-wide, bypasses scope', async () => {
      const r = await http(token, 'GET', '/hr/directory?limit=50');
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body?.data)).toBe(true);
      // Each row must carry safe identity fields and must NOT leak salary
      // / statutory ids. Catches regressions where someone adds a column
      // to the directory select that shouldn't be there.
      const row = r.body.data[0];
      if (row) {
        expect(row).toHaveProperty('firstName');
        expect(row).not.toHaveProperty('ctcAnnual');
        expect(row).not.toHaveProperty('pan');
        expect(row).not.toHaveProperty('aadhaar');
        expect(row).not.toHaveProperty('bankAccountNumber');
      }
    });

    it('GET /hr/leave-types — tenant-wide read', async () => {
      const r = await http(token, 'GET', '/hr/leave-types');
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body?.data)).toBe(true);
    });

    it('GET /hr/holidays — tenant-wide read', async () => {
      const r = await http(token, 'GET', '/hr/holidays');
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body?.data)).toBe(true);
    });

    it('GET /hr/leave-requests — scope-filtered list (regression: uuid[] cast)', async () => {
      // This single call would have caught the latent
      // `cannot cast type record to uuid[]` bug — applyHrScope's ANY(::uuid[])
      // crashed for any non-org-wide scope.
      const qs = selfEmployeeId ? `?employeeId=${selfEmployeeId}` : '';
      const r = await http(token, 'GET', `/hr/leave-requests${qs}`);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body?.data)).toBe(true);
    });

    it('GET /hr/expense-claims — scope-filtered list', async () => {
      const r = await http(token, 'GET', '/hr/expense-claims');
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body?.data)).toBe(true);
    });

    if (p.hasEmployeeRow) {
      it('GET /hr/me/payslips — resolves via email or phone fallback', async () => {
        // Regression: /hr/me used to match employee by email only, which
        // broke for phone-only OTP users. Asserts the join still resolves
        // even when synth emails don't match an employee row.
        const r = await http(token, 'GET', '/hr/me/payslips');
        expect(r.status).toBe(200);
        expect(Array.isArray(r.body?.data)).toBe(true);
      });

      it('GET /hr/leave-balances?employeeId=self — own balances only', async () => {
        // No dedicated /me/leave-balances endpoint — the mobile app calls
        // the generic list filtered by employeeId, scope-checked server-side.
        const year = new Date().getFullYear();
        const r = await http(token, 'GET', `/hr/leave-balances?employeeId=${selfEmployeeId}&year=${year}`);
        expect(r.status).toBe(200);
        expect(Array.isArray(r.body?.data)).toBe(true);
      });
    }

    it('any authenticated request — tenant membership row exists', async () => {
      // Catches the "No tenant membership for this session" regression:
      // OTP auto-provision was inserting users without the user_tenants
      // pair. /hr/me will 403 if the row is missing.
      const r = await http(token, 'GET', '/hr/me');
      expect(r.status).not.toBe(403);
    });
  });
}
