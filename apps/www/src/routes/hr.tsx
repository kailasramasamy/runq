import { useEffect } from 'react';
import { Clock, CalendarDays, IndianRupee, Globe } from 'lucide-react';
import { ComingSoon } from '@/components/sections/coming-soon';

const FEATURES = [
  {
    icon: <Clock className="size-5" />,
    title: 'Attendance Tracking',
    description: 'Biometric sync, mobile check-in, and automated shift management with overtime rules.',
  },
  {
    icon: <IndianRupee className="size-5" />,
    title: 'Payroll Processing',
    description: 'Compliant salary computation with PF, ESI, TDS auto-deduction and payslip generation.',
  },
  {
    icon: <CalendarDays className="size-5" />,
    title: 'Leave Management',
    description: 'Customisable leave policies, approval workflows, and a self-service calendar for employees.',
  },
  {
    icon: <Globe className="size-5" />,
    title: 'Employee Portal',
    description: 'A mobile-first portal where employees can view payslips, apply for leave, and update details.',
  },
];

export default function HR() {
  useEffect(() => { document.title = 'HR Module — runQ'; }, []);

  return (
    <ComingSoon
      title="AI-Powered HR for Growing Teams"
      subtitle="Attendance, payroll, leave, and an employee self-service portal — all connected to your finance module so numbers stay in sync."
      launchDate="Q3 2026"
      features={FEATURES}
      moduleName="HR"
    />
  );
}
