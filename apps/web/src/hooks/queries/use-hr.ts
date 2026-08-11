import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

// ─── Types ────────────────────────────────────────────────────────────────

export type EmploymentType = 'permanent' | 'contract' | 'intern' | 'consultant' | 'wage';
export type EmployeeStatus = 'active' | 'inactive' | 'terminated' | 'on_leave';
export type Gender = 'male' | 'female' | 'other';

export interface Department {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  /// When set, this employee's hrAccessScope includes everyone in this
  /// dept (in addition to their reporting subtree). Lets a head of HR
  /// see all of HR without putting every HR employee under one manager.
  headEmployeeId: string | null;
  isActive: boolean;
  employeeCount?: number;
}

export interface Designation {
  id: string;
  name: string;
  level: number | null;
  isActive: boolean;
}

export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  bloodGroup: string | null;
  address: string | null;
  joiningDate: string;
  confirmationDate: string | null;
  exitDate: string | null;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  branchId: string | null;
  departmentId: string | null;
  designationId: string | null;
  reportingToId: string | null;
  reportingToName: string | null;
  pan: string | null;
  aadhaar: string | null;
  uan: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  photoUrl: string | null;
  ctcAnnual: string | null;
  agency: string | null;
  dailyWageRate: string | null;
  vendorId: string | null;
  departmentName?: string | null;
  designationName?: string | null;
}

export interface EmployeeFilters {
  search?: string;
  status?: EmployeeStatus;
  departmentId?: string;
  designationId?: string;
  employmentType?: EmploymentType;
  page?: number;
  limit?: number;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  weeklyOffDays: number[];
  isNightShift: boolean;
  isActive: boolean;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'national' | 'state' | 'company' | 'optional';
  state: string | null;
  isPaid: boolean;
}

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave' | 'holiday' | 'week_off';

export interface AttendanceRow {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: string | null;
  otHours: string | null;
  status: AttendanceStatus;
  source: 'manual' | 'biometric' | 'mobile' | 'import';
  notes: string | null;
  employeeCode: string;
  employeeName: string;
}

export interface BiometricImport {
  id: string;
  fileName: string;
  deviceType: string | null;
  importedAt: string;
  totalRecords: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; reason: string }>;
}

// ─── Keys ─────────────────────────────────────────────────────────────────

export const HR_KEYS = {
  departments: ['hr', 'departments'] as const,
  designations: ['hr', 'designations'] as const,
  employees: (f?: unknown) => ['hr', 'employees', f] as const,
  employee: (id: string) => ['hr', 'employees', 'detail', id] as const,
  shifts: ['hr', 'shifts'] as const,
  holidays: (year?: number) => ['hr', 'holidays', year] as const,
  attendance: (f?: unknown) => ['hr', 'attendance', f] as const,
  attendanceImports: ['hr', 'attendance', 'imports'] as const,
  muster: (date: string) => ['hr', 'attendance', 'muster', date] as const,
};

// ─── Departments ─────────────────────────────────────────────────────────

export function useDepartments() {
  return useQuery({
    queryKey: HR_KEYS.departments,
    queryFn: () => api.get<ApiSuccess<Department[]>>(`/hr/departments`),
  });
}
export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Partial<Department>) => api.post<ApiSuccess<Department>>(`/hr/departments`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.departments }),
  });
}
export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: Partial<Department> & { id: string }) =>
      api.put<ApiSuccess<Department>>(`/hr/departments/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.departments }),
  });
}
export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<Department>>(`/hr/departments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.departments }),
  });
}

// ─── AI suggest (departments + designations) ─────────────────────────────

export interface DeptSuggestion {
  name: string;
  code: string | null;
  rationale: string;
}
export interface DesigSuggestion {
  name: string;
  level: number | null;
  rationale: string;
}
export interface BulkSeedResult {
  createdCount: number;
  skipped: string[];
}

export function useSuggestDepartments() {
  return useMutation({
    mutationFn: (description: string) =>
      api.post<ApiSuccess<{ suggestions: DeptSuggestion[] }>>(`/hr/departments/suggest`, { description }),
  });
}
export function useBulkCreateDepartments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (departments: { name: string; code: string | null }[]) =>
      api.post<ApiSuccess<BulkSeedResult>>(`/hr/departments/bulk`, { departments }),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.departments }),
  });
}

// ─── Designations ────────────────────────────────────────────────────────

export function useDesignations() {
  return useQuery({
    queryKey: HR_KEYS.designations,
    queryFn: () => api.get<ApiSuccess<Designation[]>>(`/hr/designations`),
  });
}
export function useCreateDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Partial<Designation>) => api.post<ApiSuccess<Designation>>(`/hr/designations`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.designations }),
  });
}
export function useUpdateDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: Partial<Designation> & { id: string }) =>
      api.put<ApiSuccess<Designation>>(`/hr/designations/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.designations }),
  });
}
export function useDeleteDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<Designation>>(`/hr/designations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.designations }),
  });
}
export function useSuggestDesignations() {
  return useMutation({
    mutationFn: (description: string) =>
      api.post<ApiSuccess<{ suggestions: DesigSuggestion[] }>>(`/hr/designations/suggest`, { description }),
  });
}
export function useBulkCreateDesignations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (designations: { name: string; level: number | null }[]) =>
      api.post<ApiSuccess<BulkSeedResult>>(`/hr/designations/bulk`, { designations }),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.designations }),
  });
}

// ─── Employees ───────────────────────────────────────────────────────────

export function useEmployees(filters?: EmployeeFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.departmentId) params.set('departmentId', filters.departmentId);
  if (filters?.designationId) params.set('designationId', filters.designationId);
  if (filters?.employmentType) params.set('employmentType', filters.employmentType);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: HR_KEYS.employees(filters),
    queryFn: () =>
      api.get<{ data: Employee[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
        `/hr/employees${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useEmployee(id: string | null) {
  return useQuery({
    queryKey: HR_KEYS.employee(id!),
    queryFn: () => api.get<ApiSuccess<Employee>>(`/hr/employees/${id}`),
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Partial<Employee>) => api.post<ApiSuccess<Employee>>(`/hr/employees`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'employees'] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: Partial<Employee> & { id: string }) =>
      api.put<ApiSuccess<Employee>>(`/hr/employees/${id}`, d),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr', 'employees'] });
      qc.invalidateQueries({ queryKey: HR_KEYS.employee(vars.id) });
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<Employee>>(`/hr/employees/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'employees'] }),
  });
}

// Clears the employee's mobile-login bind: zeroes the DOB-attempt lockout and
// unlinks their Google/Apple account so they can sign in again from scratch.
export function useResetMobileLogin() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<{ ok: boolean }>>(`/hr/employees/${id}/reset-mobile-login`, {}),
  });
}

// ─── Shifts ──────────────────────────────────────────────────────────────

export function useShifts() {
  return useQuery({
    queryKey: HR_KEYS.shifts,
    queryFn: () => api.get<ApiSuccess<Shift[]>>(`/hr/shifts`),
  });
}
export function useCreateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Partial<Shift>) => api.post<ApiSuccess<Shift>>(`/hr/shifts`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.shifts }),
  });
}
export function useUpdateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: Partial<Shift> & { id: string }) =>
      api.put<ApiSuccess<Shift>>(`/hr/shifts/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.shifts }),
  });
}
export function useDeleteShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<Shift>>(`/hr/shifts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: HR_KEYS.shifts }),
  });
}

// ─── Holidays ────────────────────────────────────────────────────────────

export function useHolidays(year?: number) {
  const qs = year ? `?year=${year}` : '';
  return useQuery({
    queryKey: HR_KEYS.holidays(year),
    queryFn: () => api.get<ApiSuccess<Holiday[]>>(`/hr/holidays${qs}`),
  });
}
export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Partial<Holiday>) => api.post<ApiSuccess<Holiday>>(`/hr/holidays`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'holidays'] }),
  });
}
export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<Holiday>>(`/hr/holidays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'holidays'] }),
  });
}
export type SuggestedHoliday = Omit<Holiday, 'id'>;
export interface HolidayBulkResult { created: Holiday[]; createdCount: number; skipped: string[]; }
export function useSuggestHolidays() {
  return useMutation({
    mutationFn: (d: { year: number; state?: string }) =>
      api.post<ApiSuccess<SuggestedHoliday[]>>(`/hr/holidays/suggest`, d),
  });
}
export function useBulkCreateHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (holidays: SuggestedHoliday[]) =>
      api.post<ApiSuccess<HolidayBulkResult>>(`/hr/holidays/bulk`, { holidays }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'holidays'] }),
  });
}

// ─── Attendance ──────────────────────────────────────────────────────────

export function useAttendance(filters: { employeeId?: string; dateFrom?: string; dateTo?: string; status?: AttendanceStatus }) {
  const params = new URLSearchParams();
  if (filters.employeeId) params.set('employeeId', filters.employeeId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.status) params.set('status', filters.status);
  const qs = params.toString();

  return useQuery({
    queryKey: HR_KEYS.attendance(filters),
    queryFn: () => api.get<ApiSuccess<AttendanceRow[]>>(`/hr/attendance${qs ? `?${qs}` : ''}`),
  });
}

export function useUpsertAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: {
      employeeId: string; date: string; checkIn?: string; checkOut?: string;
      status: AttendanceStatus; source?: string; notes?: string; shiftId?: string;
      hoursWorked?: number; otHours?: number;
    }) => api.post<ApiSuccess<AttendanceRow>>(`/hr/attendance`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'attendance'] }),
  });
}

export function useBiometricImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: {
      fileName: string; deviceType?: string;
      records: Array<{ employeeCode: string; date: string; checkIn?: string; checkOut?: string }>;
    }) => api.post<ApiSuccess<BiometricImport>>(`/hr/attendance/biometric-import`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'attendance'] }),
  });
}

export function useAttendanceImports() {
  return useQuery({
    queryKey: HR_KEYS.attendanceImports,
    queryFn: () => api.get<ApiSuccess<BiometricImport[]>>(`/hr/attendance/imports`),
  });
}

// ─── Leave types ─────────────────────────────────────────────────────────

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  daysPerYear: string;
  carryForward: boolean;
  maxCarryForward: string | null;
  encashable: boolean;
  isPaid: boolean;
  isActive: boolean;
}

export const LEAVE_KEYS = {
  types: ['hr', 'leave', 'types'] as const,
  balances: (f?: unknown) => ['hr', 'leave', 'balances', f] as const,
  requests: (f?: unknown) => ['hr', 'leave', 'requests', f] as const,
};

/// `includeInactive` is for the leave-types admin screen — everywhere
/// else should see only what employees can actually apply for.
export function useLeaveTypes(opts: { includeInactive?: boolean } = {}) {
  const qs = opts.includeInactive ? '?includeInactive=true' : '';
  return useQuery({
    queryKey: [...LEAVE_KEYS.types, opts.includeInactive ?? false],
    queryFn: () => api.get<ApiSuccess<LeaveType[]>>(`/hr/leave-types${qs}`),
  });
}
export function useCreateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => api.post<ApiSuccess<LeaveType>>(`/hr/leave-types`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEAVE_KEYS.types }),
  });
}
export function useUpdateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => api.put<ApiSuccess<LeaveType>>(`/hr/leave-types/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEAVE_KEYS.types }),
  });
}
export function useDeleteLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<LeaveType>>(`/hr/leave-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEAVE_KEYS.types }),
  });
}
export function useSeedDefaultLeaveTypes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ApiSuccess<{ skipped: boolean; count: number }>>(`/hr/leave-types/seed-defaults`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEAVE_KEYS.types }),
  });
}

// ─── Leave balances ──────────────────────────────────────────────────────

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  opening: string;
  accrued: string;
  used: string;
  balance: number;
  typeName: string;
  typeCode: string;
  employeeCode: string;
  employeeName: string;
}

export function useLeaveBalances(filter: { employeeId?: string; year?: number }) {
  const params = new URLSearchParams();
  if (filter.employeeId) params.set('employeeId', filter.employeeId);
  if (filter.year) params.set('year', String(filter.year));
  const qs = params.toString();
  return useQuery({
    queryKey: LEAVE_KEYS.balances(filter),
    queryFn: () => api.get<ApiSuccess<LeaveBalance[]>>(`/hr/leave-balances${qs ? `?${qs}` : ''}`),
  });
}

export function useAdjustLeaveBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { employeeId: string; leaveTypeId: string; year: number; opening?: number; accrued?: number; used?: number }) =>
      api.put<ApiSuccess<LeaveBalance>>(`/hr/leave-balances`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'leave', 'balances'] }),
  });
}

export function useCarryForwardLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { fromYear: number; toYear: number }) =>
      api.post<ApiSuccess<{ moved: number }>>(`/hr/leave-balances/carry-forward`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'leave', 'balances'] }),
  });
}

export function useInitializeLeaveBalances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { year: number }) =>
      api.post<ApiSuccess<{ employees: number; created: number }>>(`/hr/leave-balances/initialize`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'leave', 'balances'] }),
  });
}

// ─── Leave requests ──────────────────────────────────────────────────────

export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: string;
  reason: string | null;
  status: LeaveRequestStatus;
  appliedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  typeName: string;
  typeCode: string;
  isPaid: boolean;
  employeeCode: string;
  employeeName: string;
}

export function useLeaveRequests(filter: { employeeId?: string; status?: LeaveRequestStatus; dateFrom?: string; dateTo?: string }) {
  const params = new URLSearchParams();
  if (filter.employeeId) params.set('employeeId', filter.employeeId);
  if (filter.status) params.set('status', filter.status);
  if (filter.dateFrom) params.set('dateFrom', filter.dateFrom);
  if (filter.dateTo) params.set('dateTo', filter.dateTo);
  const qs = params.toString();
  return useQuery({
    queryKey: LEAVE_KEYS.requests(filter),
    queryFn: () => api.get<ApiSuccess<LeaveRequest[]>>(`/hr/leave-requests${qs ? `?${qs}` : ''}`),
  });
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; halfDay?: boolean; reason?: string }) =>
      api.post<ApiSuccess<LeaveRequest>>(`/hr/leave-requests`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'leave', 'requests'] });
      qc.invalidateQueries({ queryKey: ['hr', 'leave', 'balances'] });
    },
  });
}

export function useReviewLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: { id: string; approved: boolean; rejectionReason?: string }) =>
      api.put<ApiSuccess<LeaveRequest>>(`/hr/leave-requests/${id}/review`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'leave', 'requests'] });
      qc.invalidateQueries({ queryKey: ['hr', 'leave', 'balances'] });
      qc.invalidateQueries({ queryKey: ['hr', 'attendance'] });
    },
  });
}

export function useCancelLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.put<ApiSuccess<LeaveRequest>>(`/hr/leave-requests/${id}/cancel`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'leave', 'requests'] });
      qc.invalidateQueries({ queryKey: ['hr', 'leave', 'balances'] });
    },
  });
}

// ─── Wage register ──────────────────────────────────────────────────────

export interface WageRegisterRow {
  employeeCode: string; employeeName: string;
  designation: string | null; department: string | null; agency: string | null;
  dailyWageRate: number; daysWorked: number; halfDays: number;
  otHours: number; grossWages: number;
}

export function useWageRegister(year: number, month: number) {
  return useQuery({
    queryKey: ['hr', 'wage-register', year, month],
    queryFn: () =>
      api.get<ApiSuccess<WageRegisterRow[]>>(`/hr/wage-register?year=${year}&month=${month}`),
    enabled: !!year && !!month,
  });
}

// ─── Post expense claim to AP ──────────────────────────────────────────

export function usePostClaimToAp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, employeeId }: { id: string; employeeId: string }) =>
      api.post<ApiSuccess<{ billId: string; vendorId: string }>>(`/hr/expense-claims/${id}/post-to-ap`, { employeeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-claims'] }),
  });
}

// ─── HR dashboard summary ────────────────────────────────────────────────

export interface HrDashboardSummary {
  payroll: {
    runId: string | null;
    month: number;
    year: number;
    status: 'draft' | 'processed' | 'approved' | 'closed' | null;
    totalNet: string;
  };
  employeesWithoutSalary: number;
  attendanceNotMarkedToday: number;
  confirmationsDue: number;
  helpdeskWaiting: number;
  attendanceTrend: Array<{
    year: number;
    month: number;
    present: number;
    totalMarked: number;
    ratePct: number;
  }>;
}

export function useHrDashboard() {
  return useQuery({
    queryKey: ['hr', 'dashboard'],
    queryFn: () => api.get<ApiSuccess<HrDashboardSummary>>(`/hr/dashboard`),
  });
}

export function useDailyMuster(date: string) {
  return useQuery({
    queryKey: HR_KEYS.muster(date),
    queryFn: () => api.get<ApiSuccess<Record<AttendanceStatus, number>>>(`/hr/attendance/muster?date=${date}`),
    enabled: !!date,
  });
}

/** Joined row from `GET /hr/dashboard/expiring-documents`. */
export interface ExpiringDoc {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePhotoUrl: string | null;
  documentKind: string | null;
  fileName: string;
  expiryDate: string; // YYYY-MM-DD
}

/** HR docs expiring within the next `daysAhead` window. Drives the
 *  manager dashboard's "Document expiries" card. */
export function useExpiringDocuments(daysAhead = 90) {
  return useQuery({
    queryKey: ['hr', 'dashboard', 'expiring-docs', daysAhead],
    queryFn: () => api.get<ApiSuccess<ExpiringDoc[]>>(
      `/hr/dashboard/expiring-documents?daysAhead=${daysAhead}`,
    ),
  });
}

// ─── /hr/me ────────────────────────────────────────────────────────────────

/** Slim response from `/hr/me` — used by the dashboard to badge scope. */
export interface HrMe {
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string | null;
    /// Department the employee belongs to. Used by the announcement
    /// post modal to show managers their locked-to dept name; server
    /// also reads this when narrowing a manager's post audience.
    departmentId: string | null;
  } | null;
  isManager: boolean;
  systemRole: 'owner' | 'accountant' | 'viewer' | 'client_owner' | 'hr';
  /// 'all' | 'subset' | 'self' | 'none' — set by the server's access-scope
  /// resolver. The badge maps these to "Showing all" / "Showing your team".
  scopeKind: 'all' | 'subset' | 'self' | 'none';
  /// Count of employees the caller can see. Null for org-wide (`all`) so
  /// we don't display a misleading number on the admin dashboard.
  visibleCount: number | null;
}

export function useHrMe() {
  return useQuery({
    queryKey: ['hr', 'me'],
    queryFn: () => api.get<ApiSuccess<HrMe>>('/hr/me'),
  });
}

// ─── Announcements ─────────────────────────────────────────────────────────

export type AnnouncementAudience = 'all' | 'managers';

export type AnnouncementCategory =
  | 'general'
  | 'policy'
  | 'holiday'
  | 'event'
  | 'operational'
  | 'celebration'
  | 'payroll';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  category: AnnouncementCategory;
  departmentId: string | null;
  departmentName: string | null;
  /// Relative path served by /hr/announcements/:id/image. NULL = text-only.
  imageUrl: string | null;
  pinned: boolean;
  postedAt: string;
  expiresAt: string | null;
  postedById: string | null;
  postedByName: string | null;
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ['hr', 'announcements'],
    queryFn: () => api.get<ApiSuccess<Announcement[]>>('/hr/announcements'),
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      body: string;
      audience?: AnnouncementAudience;
      category?: AnnouncementCategory;
      /// Omit / null → org-wide (visible to every department).
      departmentId?: string | null;
      pinned?: boolean;
      // ISO string; null/undefined → never expires.
      expiresAt?: string | null;
    }) => api.post<ApiSuccess<Announcement>>('/hr/announcements', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'announcements'] }),
  });
}

/// Multipart upload of a cover image for an announcement. The server
/// resizes + JPEG-encodes; subsequent reads stream via
/// GET /hr/announcements/:id/image (authenticated, private cache).
export function useUploadAnnouncementImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { announcementId: string; file: File }) => {
      const form = new FormData();
      form.append('file', params.file);
      const json = await api.upload<ApiSuccess<{ storageKey: string }>>(
        `/hr/announcements/${params.announcementId}/image`,
        form,
      );
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'announcements'] }),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      title?: string;
      body?: string;
      audience?: AnnouncementAudience;
      category?: AnnouncementCategory;
      /// null = clear (move back to org-wide).
      departmentId?: string | null;
      pinned?: boolean;
      expiresAt?: string | null;
    }) => api.put<ApiSuccess<Announcement>>(`/hr/announcements/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'announcements'] }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/hr/announcements/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'announcements'] }),
  });
}

/// Fetches the cover image as a blob URL the browser can use in
/// <img src>. Mirrors useEmployeePhotoSrc — needed because the
/// /image stream requires a Bearer header that <img> can't carry.
export function useAnnouncementImageSrc(announcementId: string, imageUrl: string | null) {
  return useQuery({
    queryKey: ['hr', 'announcements', 'image', announcementId, imageUrl],
    enabled: !!announcementId && !!imageUrl,
    queryFn: async () => {
      const res = await fetch(`/api/v1/hr/announcements/${announcementId}/image`, {
        headers: api.authHeaders(),
        cache: 'no-cache',
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    staleTime: Infinity,
  });
}

// ─── Recent activity ───────────────────────────────────────────────────────

export type ActivityKind =
  | 'employee_added'
  | 'employee_exited'
  | 'leave_approved'
  | 'leave_rejected'
  | 'salary_assigned'
  | 'document_uploaded'
  | 'payroll_started';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  occurredAt: string;
  title: string;
  subject: string | null;
  employeeId: string | null;
  employeeName: string | null;
}

/** Rolled-up HR events for the manager dashboard. Server returns up to 20. */
export function useRecentActivity() {
  return useQuery({
    queryKey: ['hr', 'dashboard', 'recent-activity'],
    queryFn: () => api.get<ApiSuccess<ActivityEvent[]>>('/hr/dashboard/recent-activity'),
  });
}
