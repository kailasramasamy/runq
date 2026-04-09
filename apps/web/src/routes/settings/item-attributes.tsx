import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, GripVertical } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useItemAttributeSchema,
  useUpdateItemAttributeSchema,
} from '@/hooks/queries/use-items';
import type { ItemAttributeField, ItemAttributeFieldType } from '@runq/types';

const FIELD_TYPE_OPTIONS: { value: ItemAttributeFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Long text' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Dropdown' },
];

/**
 * Catalogue Attributes settings page. Lets the tenant customize which
 * fields appear in the Catalogue Details section of the item form and
 * which columns show up in the items list / CSV export.
 *
 * Shape invariants enforced client-side (mirror the backend validator):
 * - max 20 fields
 * - unique keys
 * - keys are ASCII-identifier-safe (start with letter, then letters/
 *   digits/underscores)
 *
 * Behaviour notes:
 * - Renaming a key IS blocked after creation — existing items.attributes
 *   rows key off it and would silently orphan. Surfaced as a disabled
 *   input + explanation in the field editor.
 * - Deleting a field does not purge data from existing items.attributes.
 *   The values will become hidden but remain in the JSONB. A warning
 *   toast on delete flags this.
 */
export function ItemAttributesPage() {
  const { data: schemaRes, isLoading } = useItemAttributeSchema();
  const update = useUpdateItemAttributeSchema();
  const { toast } = useToast();

  const [fields, setFields] = useState<ItemAttributeField[]>([]);
  const [editing, setEditing] = useState<{ index: number; field: ItemAttributeField } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (schemaRes?.data) {
      setFields(schemaRes.data);
      setDirty(false);
    }
  }, [schemaRes]);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index]!, next[target]!] = [next[target]!, next[index]!];
    setFields(next);
    setDirty(true);
  };

  const remove = (index: number) => {
    const field = fields[index]!;
    setFields((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
    toast(`Removed "${field.label}". Existing item values with this key are kept but hidden.`, 'success');
  };

  const openNew = () => {
    if (fields.length >= 20) {
      toast('Maximum 20 catalogue fields. Remove one first.', 'error');
      return;
    }
    setEditing({
      index: -1,
      field: { key: '', label: '', type: 'text' },
    });
  };

  const openEdit = (index: number) => {
    setEditing({ index, field: { ...fields[index]! } });
  };

  const saveField = (field: ItemAttributeField) => {
    if (!editing) return;
    // Key uniqueness check (ignore the field's own current key when editing)
    const keyExists = fields.some(
      (f, i) => f.key === field.key && i !== editing.index,
    );
    if (keyExists) {
      toast(`A field with key "${field.key}" already exists.`, 'error');
      return;
    }
    if (editing.index === -1) {
      setFields((prev) => [...prev, field]);
    } else {
      setFields((prev) => prev.map((f, i) => (i === editing.index ? field : f)));
    }
    setDirty(true);
    setEditing(null);
  };

  const handleSave = async () => {
    try {
      await update.mutateAsync(fields);
      setDirty(false);
      toast('Catalogue attributes saved', 'success');
    } catch {
      toast('Failed to save catalogue attributes', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="Catalogue Attributes"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Catalogue Attributes' }]}
        description="Customize the fields that appear under Catalogue Details on each item. These drive the item form, the list view, and CSV export."
      />

      <Card className="max-w-4xl">
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {fields.length} field{fields.length === 1 ? '' : 's'} · max 20
            </p>
            <Button type="button" size="sm" onClick={openNew}>
              <Plus size={14} /> Add Field
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800"
                />
              ))}
            </div>
          ) : fields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No catalogue fields yet. Add one to customize your item form.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {fields.map((f, index) => (
                <li
                  key={f.key}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <GripVertical size={14} className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                      <Badge variant="default">{fieldTypeLabel(f.type)}</Badge>
                      {f.required && <Badge variant="warning">Required</Badge>}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {f.key}
                      {f.type === 'select' && f.options ? ` · ${f.options.length} options` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => move(index, 1)}
                      disabled={index === fields.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDown size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(index)}
                      aria-label="Edit"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => remove(index)}
                      aria-label="Remove"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <Button type="button" variant="outline" size="sm" onClick={() => { setFields(schemaRes?.data ?? []); setDirty(false); }} disabled={!dirty}>
            Reset
          </Button>
          <Button type="button" size="sm" onClick={handleSave} loading={update.isPending} disabled={!dirty}>
            Save Changes
          </Button>
        </div>
      </Card>

      {editing && (
        <FieldEditor
          initial={editing.field}
          isNew={editing.index === -1}
          onClose={() => setEditing(null)}
          onSave={saveField}
        />
      )}
    </div>
  );
}

function fieldTypeLabel(type: ItemAttributeFieldType): string {
  return FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function slugifyKey(label: string): string {
  const cleaned = label
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (cleaned.length === 0) return '';
  const [first, ...rest] = cleaned;
  return (
    first!.toLowerCase() +
    rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')
  );
}

/**
 * Editor modal for a single attribute field. When `isNew` is true, the
 * key is auto-derived from the label as the user types, but can be
 * overridden. When editing, the key is frozen because renaming would
 * orphan existing values in items.attributes.
 */
function FieldEditor({
  initial,
  isNew,
  onClose,
  onSave,
}: {
  initial: ItemAttributeField;
  isNew: boolean;
  onClose: () => void;
  onSave: (field: ItemAttributeField) => void;
}) {
  const [label, setLabel] = useState(initial.label);
  const [key, setKey] = useState(initial.key);
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(!isNew || initial.key.length > 0);
  const [type, setType] = useState<ItemAttributeFieldType>(initial.type);
  const [placeholder, setPlaceholder] = useState(initial.placeholder ?? '');
  const [help, setHelp] = useState(initial.help ?? '');
  const [required, setRequired] = useState(!!initial.required);
  const [options, setOptions] = useState<{ value: string; label: string }[]>(
    initial.options ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  // Auto-derive the key from the label until the user manually overrides
  // it. Only happens on new fields — edit mode freezes the key.
  useEffect(() => {
    if (!isNew || keyManuallyEdited) return;
    setKey(slugifyKey(label));
  }, [label, isNew, keyManuallyEdited]);

  const submit = () => {
    if (!label.trim()) {
      setError('Label is required');
      return;
    }
    if (!key.trim()) {
      setError('Key is required');
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      setError('Key must start with a letter and contain only letters, digits, and underscores');
      return;
    }
    if (type === 'select' && options.length === 0) {
      setError('Dropdown fields need at least one option');
      return;
    }
    if (type === 'select' && options.some((o) => !o.value.trim() || !o.label.trim())) {
      setError('Every option needs a value and a label');
      return;
    }

    const field: ItemAttributeField = {
      key: key.trim(),
      label: label.trim(),
      type,
      ...(placeholder.trim() ? { placeholder: placeholder.trim() } : {}),
      ...(help.trim() ? { help: help.trim() } : {}),
      ...(required ? { required: true } : {}),
      ...(type === 'select' ? { options } : {}),
    };
    onSave(field);
  };

  return (
    <Modal open={true} onClose={onClose} title={isNew ? 'Add Field' : 'Edit Field'} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Size"
            required
          />
          <Input
            label="Key"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setKeyManuallyEdited(true);
            }}
            disabled={!isNew}
            helper={
              isNew
                ? 'Auto-derived from label. ASCII letters/digits/underscores only.'
                : 'Key is frozen — renaming would orphan existing item values.'
            }
            placeholder="e.g. size"
            required
          />
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as ItemAttributeFieldType)}
            options={FIELD_TYPE_OPTIONS}
          />
          <Input
            label="Placeholder"
            value={placeholder}
            onChange={(e) => setPlaceholder(e.target.value)}
            placeholder="Hint shown in the empty field"
          />
        </div>
        <Textarea
          label="Help text"
          value={help}
          onChange={(e) => setHelp(e.target.value)}
          placeholder="Optional — appears below the field"
          rows={2}
        />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
          />
          Required — cannot be left blank
        </label>

        {type === 'select' && <OptionsEditor options={options} onChange={setOptions} />}

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={submit}>
            {isNew ? 'Add Field' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[];
  onChange: (next: { value: string; label: string }[]) => void;
}) {
  const add = () => onChange([...options, { value: '', label: '' }]);
  const remove = (i: number) => onChange(options.filter((_, idx) => idx !== i));
  const set = (i: number, patch: Partial<{ value: string; label: string }>) =>
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Options
        </p>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus size={12} /> Add Option
        </Button>
      </div>
      {options.length === 0 ? (
        <p className="py-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
          No options yet. Click Add Option to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                placeholder="Stored value"
                value={o.value}
                onChange={(e) => set(i, { value: e.target.value })}
              />
              <Input
                placeholder="Shown label"
                value={o.label}
                onChange={(e) => set(i, { label: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => remove(i)}
                aria-label="Remove option"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
