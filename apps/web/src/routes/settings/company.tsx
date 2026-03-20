import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  PageHeader,
  Button,
  Input,
  Select,
} from '@/components/ui';
import { useCompanySettings, useUpdateCompanySettings } from '@/hooks/queries/use-settings';
import { useToast } from '@/components/ui';

const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: '0', label: 'Due immediately' },
  { value: '7', label: 'Net 7 days' },
  { value: '15', label: 'Net 15 days' },
  { value: '30', label: 'Net 30 days' },
  { value: '45', label: 'Net 45 days' },
  { value: '60', label: 'Net 60 days' },
  { value: '90', label: 'Net 90 days' },
];

export function CompanySettingsPage() {
  const { data, isLoading } = useCompanySettings();
  const update = useUpdateCompanySettings();
  const { toast } = useToast();

  const [fyMonth, setFyMonth] = useState('4');
  const [paymentTerms, setPaymentTerms] = useState('30');

  useEffect(() => {
    if (data?.data) {
      setFyMonth(String(data.data.financialYearStartMonth ?? 4));
      setPaymentTerms(String(data.data.defaultPaymentTermsDays ?? 30));
    }
  }, [data]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        currency: 'INR',
        financialYearStartMonth: Number(fyMonth),
        defaultPaymentTermsDays: Number(paymentTerms),
      });
      toast('Settings saved', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Company Settings"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Company' }]}
        description="Configure your company's financial preferences."
      />

      <form onSubmit={handleSave}>
        <Card className="max-w-xl">
          <CardContent className="space-y-5 pt-5">
            {/* Company Name (read-only) */}
            <Input
              label="Company Name"
              value={isLoading ? '—' : (data?.data?.name ?? '')}
              readOnly
              disabled
              helper="Contact support to change your company name."
            />

            {/* Currency */}
            <Input
              label="Currency"
              value="INR — Indian Rupee (₹)"
              readOnly
              disabled
              helper="Currency is fixed to INR for this tenant."
            />

            {/* Financial Year Start */}
            <Select
              label="Financial Year Start Month"
              value={fyMonth}
              onChange={(e) => setFyMonth(e.target.value)}
              options={MONTH_OPTIONS}
              helper="The month your financial year begins. Default: April (India)."
            />

            {/* Default Payment Terms */}
            <Select
              label="Default Payment Terms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              options={PAYMENT_TERMS_OPTIONS}
              helper="Applied to new bills and invoices by default."
            />
          </CardContent>

          <CardFooter className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Building2 size={14} />
              <span>Changes apply to all new documents.</span>
            </div>
            <Button type="submit" loading={update.isPending}>
              Save Changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
