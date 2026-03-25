import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHsnSacSearch } from '@/hooks/queries/use-hsn-sac';

const baseInputClasses =
  'block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors duration-150 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-indigo-400 dark:disabled:bg-zinc-800';

interface HsnSacComboboxProps {
  label?: string;
  value: string;
  onChange: (code: string, gstRate: number | null) => void;
  type?: 'hsn' | 'sac';
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

export function HsnSacCombobox({
  label,
  value,
  onChange,
  type,
  placeholder = 'Search HSN/SAC code…',
  error,
  required,
  disabled,
}: HsnSacComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { data: results, isLoading } = useHsnSacSearch(query, type);
  const items = results?.data ?? [];

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  useEffect(() => {
    if (open && activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  function handleSelect(code: string, gstRate: number | null) {
    onChange(code, gstRate);
    closeDropdown();
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('', null);
    setQuery('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        setActiveIndex((i) => Math.min(i + 1, items.length - 1));
        e.preventDefault();
        break;
      case 'ArrowUp':
        setActiveIndex((i) => Math.max(i - 1, 0));
        e.preventDefault();
        break;
      case 'Enter':
        if (activeIndex >= 0 && items[activeIndex]) {
          handleSelect(items[activeIndex].code, items[activeIndex].gstRate);
        }
        e.preventDefault();
        break;
      case 'Escape':
        closeDropdown();
        break;
    }
  }

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      <div ref={containerRef} className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          disabled={disabled}
          placeholder={value || placeholder}
          value={open ? query : value}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(
            baseInputClasses,
            'pl-8 pr-8',
            error && 'border-red-500 focus:ring-red-500/20 dark:border-red-500',
          )}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={14} />
          </button>
        )}
        {open && (
          <ul
            ref={listRef}
            role="listbox"
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            {isLoading && query.length >= 2 && (
              <li className="px-3 py-2 text-sm text-zinc-400">Searching…</li>
            )}
            {!isLoading && query.length >= 2 && items.length === 0 && (
              <li className="px-3 py-2 text-sm text-zinc-400">No codes found</li>
            )}
            {query.length < 2 && (
              <li className="px-3 py-2 text-sm text-zinc-400">Type at least 2 characters</li>
            )}
            {items.map((item, idx) => (
              <li
                key={item.code}
                role="option"
                aria-selected={item.code === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(item.code, item.gstRate)}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm',
                  idx === activeIndex
                    ? 'bg-indigo-50 dark:bg-indigo-900/20'
                    : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20',
                  item.code === value && 'bg-indigo-50 font-medium dark:bg-indigo-900/20',
                )}
              >
                <div className="flex items-center justify-between">
                  <span>
                    <span className="font-mono font-medium">{item.code}</span>
                    <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                      {item.description}
                    </span>
                  </span>
                  {item.gstRate != null && (
                    <span className="ml-2 shrink-0 text-xs text-indigo-600 dark:text-indigo-400">
                      {item.gstRate}%
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
