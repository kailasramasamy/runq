import { cn } from '@/lib/utils';
import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react';

const baseInputClasses =
  'block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors duration-150 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-indigo-400 dark:disabled:bg-zinc-800';

function FieldWrapper({
  label,
  error,
  helper,
  required,
  children,
}: {
  label?: string;
  error?: string;
  helper?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!error && helper && <p className="text-xs text-zinc-500 dark:text-zinc-400">{helper}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, required, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} helper={helper} required={required}>
      <input
        ref={ref}
        required={required}
        className={cn(baseInputClasses, error && 'border-red-500 focus:ring-red-500/20 dark:border-red-500', className)}
        {...props}
      />
    </FieldWrapper>
  ),
);
Input.displayName = 'Input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helper?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helper, required, options, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} helper={helper} required={required}>
      <select
        ref={ref}
        required={required}
        className={cn(baseInputClasses, error && 'border-red-500 focus:ring-red-500/20 dark:border-red-500', className)}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldWrapper>
  ),
);
Select.displayName = 'Select';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helper, required, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} helper={helper} required={required}>
      <textarea
        ref={ref}
        required={required}
        rows={3}
        className={cn(baseInputClasses, 'resize-y', error && 'border-red-500 focus:ring-red-500/20 dark:border-red-500', className)}
        {...props}
      />
    </FieldWrapper>
  ),
);
Textarea.displayName = 'Textarea';

export const DateInput = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, required, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} helper={helper} required={required}>
      <input
        ref={ref}
        type="date"
        required={required}
        className={cn(baseInputClasses, error && 'border-red-500 focus:ring-red-500/20 dark:border-red-500', className)}
        {...props}
      />
    </FieldWrapper>
  ),
);
DateInput.displayName = 'DateInput';
