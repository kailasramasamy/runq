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
  pan: string | null;
  aadhaar: string | null;
  uan: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  ctcAnnual: string | null;
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

export function useLeaveTypes() {
  return useQuery({
    queryKey: LEAVE_KEYS.types,
    queryFn: () => api.get<ApiSuccess<LeaveType[]>>(`/hr/leave-types`),
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
    mutationFn: (d: { employeeId: string; leaveTypeId: string; year: number; opening?: number; accrued?: number }) =>
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

export function useDailyMuster(date: string) {
  return useQuery({
    queryKey: HR_KEYS.muster(date),
    queryFn: () => api.get<ApiSuccess<Record<AttendanceStatus, number>>>(`/hr/attendance/muster?date=${date}`),
    enabled: !!date,
  });
}
