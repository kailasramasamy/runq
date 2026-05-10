import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const baseInputClasses =
  'block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors duration-150 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-indigo-400 dark:disabled:bg-zinc-800';

interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  label?: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

function FieldWrapper({
  label,
  error,
  required,
  children,
}: {
  label?: string;
  error?: string;
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
    </div>
  );
}

export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search…',
  error,
  required,
  disabled,
}: ComboboxProps) {
  const selectedOption = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Dropdown is rendered through a portal so it escapes any ancestor with
  // overflow:hidden / overflow:auto (e.g. modals). We anchor it to the input
  // by tracking the input's bounding rect, and cap its height to the
  // remaining viewport so it doesn't run off-screen.
  const [dropdownPos, setDropdownPos] = useState<
    { top: number; left: number; width: number; maxHeight: number } | null
  >(null);

  const updateDropdownPos = useCallback(() => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const margin = 12;
    // Cap at ~10 rows worth of height (≈ 36px each + padding) so a long
    // catalogue scrolls within the dropdown instead of stretching down the
    // viewport. Then clamp to whatever space is actually available.
    const TEN_ROWS = 360;
    const maxHeight = Math.max(120, Math.min(TEN_ROWS, window.innerHeight - r.bottom - margin));
    setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width, maxHeight });
  }, []);

  const filtered = options.filter(
    (o) => o.value !== '' && o.label.toLowerCase().includes(query.toLowerCase()),
  );

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      const insideTrigger = containerRef.current?.contains(t) ?? false;
      // Listbox lives in a portal — must check it separately.
      const insideList = listRef.current?.contains(t) ?? false;
      if (!insideTrigger && !insideList) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  // Keep the portalled dropdown anchored to the input on open + when the
  // page scrolls or the window resizes.
  useLayoutEffect(() => {
    if (!open) return;
    updateDropdownPos();
    const onMove = () => updateDropdownPos();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, updateDropdownPos]);

  useEffect(() => {
    if (open && activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleFocus() {
    if (!disabled) setOpen(true);
  }

  function selectOption(opt: ComboboxOption) {
    onChange(opt.value);
    closeDropdown();
  }

  function clearSelection(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        setActiveIndex(0);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        e.preventDefault();
        break;
      case 'ArrowUp':
        setActiveIndex((i) => Math.max(i - 1, 0));
        e.preventDefault();
        break;
      case 'Enter':
        if (activeIndex >= 0 && filtered[activeIndex]) {
          selectOption(filtered[activeIndex]);
        }
        e.preventDefault();
        break;
      case 'Escape':
        closeDropdown();
        break;
    }
  }

  // Fall back to the raw value when it isn't in the options list — this
  // happens for items whose category was created outside the master (e.g.
  // legacy data, or items imported with a category not yet in the tree).
  // Without this fallback the field renders empty even though a value is set.
  const displayValue = open ? query : (selectedOption?.label ?? value ?? '');

  return (
    <FieldWrapper label={label} error={error} required={required}>
      <div ref={containerRef} className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          required={required}
          placeholder={selectedOption ? selectedOption.label : placeholder}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className={cn(
            baseInputClasses,
            'pr-8',
            error && 'border-red-500 focus:ring-red-500/20 dark:border-red-500',
          )}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={14} />
          </button>
        )}
        {open && dropdownPos && createPortal(
          <ul
            ref={listRef}
            role="listbox"
            // Portalled into <body> so the listbox escapes any ancestor's
            // overflow clipping (modals, scrollable cards). Anchored to the
            // input's bounding rect via fixed positioning.
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              maxHeight: dropdownPos.maxHeight,
              zIndex: 200,
            }}
            className="min-w-[240px] overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500">
                No results found
              </li>
            ) : (
              filtered.map((opt, idx) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOption(opt)}
                  // Portalled into <body> — must set explicit text color
                  // because the dropdown no longer inherits from a styled
                  // ancestor.
                  className={cn(
                    'cursor-pointer px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100',
                    idx === activeIndex
                      ? 'bg-indigo-50 dark:bg-indigo-900/40'
                      : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/40',
                    opt.value === value && 'bg-indigo-50 font-medium dark:bg-indigo-900/40',
                  )}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
      </div>
    </FieldWrapper>
  );
}
