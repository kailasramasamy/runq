import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useCreateFixedAsset, useAssetCategories } from '@/hooks/queries/use-fixed-assets';
import { useVendors } from '@/hooks/queries/use-vendors';
import {
  PageHeader, Button, Card, CardContent, Input, DateInput, Combobox, Textarea, useToast,
} from '@/components/ui';

export function NewAssetPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createMutation = useCreateFixedAsset();
  const { data: catsData } = useAssetCategories();
  const { data: vendorsData } = useVendors({ limit: 200 });

  const categoryOptions = (catsData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const vendorOptions = (vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name }));

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [residualValue, setResidualValue] = useState('');
  const [putToUseDate, setPutToUseDate] = useState('');
  const [location, setLocation] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [gstCreditClaimed, setGstCreditClaimed] = useState(false);
  const [gstAmount, setGstAmount] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !categoryId || !acquisitionDate || !acquisitionCost) {
      setError('Name, category, acquisition date and cost are required.');
      return;
    }
    createMutation.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        categoryId,
        acquisitionDate,
        acquisitionCost: parseFloat(acquisitionCost),
        residualValue: residualValue ? parseFloat(residualValue) : 0,
        putToUseDate: putToUseDate || undefined,
        location: location.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        vendorId: vendorId || undefined,
        gstCreditClaimed,
        gstAmount: gstAmount ? parseFloat(gstAmount) : 0,
      },
      {
        onSuccess: () => { toast('Asset created', 'success'); navigate({ to: '/finance/fa/assets' }); },
        onError: (err: any) => setError(err?.message ?? 'Failed to create asset'),
      },
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader fullWidth
        title="New Asset"
        description="Add a fixed asset to the register."
        breadcrumbs={[
          { label: 'Fixed Assets', href: '/fa' },
          { label: 'Asset Register', href: '/fa/assets' },
          { label: 'New Asset' },
        ]}
      />

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Asset Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CNC Machine #3" />
              <Combobox label="Category" required options={categoryOptions} value={categoryId} onChange={setCategoryId} placeholder="Select category…" />
            </div>

            <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes about this asset" rows={2} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <DateInput label="Acquisition Date" required value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
              <Input label="Acquisition Cost (₹)" required type="number" min="0" step="0.01" value={acquisitionCost} onChange={(e) => setAcquisitionCost(e.target.value)} placeholder="0.00" />
              <Input label="Residual Value (₹)" type="number" min="0" step="0.01" value={residualValue} onChange={(e) => setResidualValue(e.target.value)} placeholder="0.00" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DateInput label="Put to Use Date" value={putToUseDate} onChange={(e) => setPutToUseDate(e.target.value)} />
              <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Factory Floor A" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Serial Number" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Manufacturer serial #" />
              <Combobox label="Vendor" options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Select vendor…" />
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gstCreditClaimed}
                  onChange={(e) => setGstCreditClaimed(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
                />
                GST Input Credit Claimed
              </label>
              {gstCreditClaimed && (
                <div className="min-w-[180px]">
                  <Input label="GST Amount (₹)" type="number" min="0" step="0.01" value={gstAmount} onChange={(e) => setGstAmount(e.target.value)} placeholder="0.00" />
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" size="sm" loading={createMutation.isPending}>Create Asset</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => navigate({ to: '/finance/fa/assets' })}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
