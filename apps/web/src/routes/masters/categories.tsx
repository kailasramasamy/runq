import { useState } from 'react';
import { Plus, X, Pencil, Trash2, Power, ChevronRight, ChevronDown } from 'lucide-react';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, useToast, ConfirmationDialog,
} from '@/components/ui';
import {
  useCategoryTree, useCreateCategory, useUpdateCategory, useToggleCategory, useDeleteCategory,
  type Category,
} from '@/hooks/queries/use-categories';

// ─── Inline Add/Edit Form ───────────────────────────────────────────────────

function CategoryForm({ category, parentId, onClose }: {
  category?: Category;
  parentId?: string | null;
  onClose: () => void;
}) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const { toast } = useToast();
  const isEdit = !!category;

  const [name, setName] = useState(category?.name ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      if (isEdit) {
        await update.mutateAsync({ id: category.id, data: { name } });
        toast('Category updated', 'success');
      } else {
        await create.mutateAsync({ name, parentId: parentId ?? null });
        toast('Category created', 'success');
      }
      onClose();
    } catch {
      toast(`Failed to ${isEdit ? 'update' : 'create'} category`, 'error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <Input
        label={isEdit ? 'Rename' : parentId ? 'New Subcategory' : 'New Category'}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder={parentId ? 'Subcategory name' : 'Category name'}
        autoFocus
      />
      <Button type="submit" size="sm" loading={create.isPending || update.isPending}>
        {isEdit ? 'Save' : 'Add'}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>
        <X size={14} />
      </Button>
    </form>
  );
}

// ─── Category Row (recursive for tree) ──────────────────────────────────────

function CategoryRow({ category, depth = 0 }: { category: Category; depth?: number }) {
  const toggle = useToggleCategory();
  const remove = useDeleteCategory();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [showAddSub, setShowAddSub] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const subs = category.subcategories ?? [];
  const hasChildren = subs.length > 0;

  async function handleToggle() {
    try {
      await toggle.mutateAsync(category.id);
      toast('Status toggled', 'success');
    } catch {
      toast('Failed to toggle status', 'error');
    }
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync(category.id);
      toast('Category deleted', 'success');
      setConfirmDelete(false);
    } catch {
      toast('Failed to delete — remove subcategories first', 'error');
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div
        className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
        style={{ paddingLeft: `${16 + depth * 24}px` }}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5" />}
        </button>

        {/* Name */}
        <span className={`flex-1 text-sm ${depth === 0 ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
          {category.name}
        </span>

        {/* Subcategory count */}
        {hasChildren && (
          <span className="text-xs text-zinc-400">{subs.length} sub</span>
        )}

        {/* Status */}
        <Badge variant={category.isActive ? 'success' : 'default'}>
          {category.isActive ? 'Active' : 'Inactive'}
        </Badge>

        {/* Actions */}
        <div className="flex gap-1">
          {depth === 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setShowAddSub(true); setExpanded(true); }}>
              <Plus size={12} />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={12} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggle} disabled={toggle.isPending}>
            <Power size={12} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={12} />
          </Button>
        </div>
      </div>

      {/* Inline edit */}
      {editing && (
        <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-800" style={{ paddingLeft: `${40 + depth * 24}px` }}>
          <CategoryForm category={category} onClose={() => setEditing(false)} />
        </div>
      )}

      {/* Subcategories */}
      {expanded && subs.map((sub) => (
        <CategoryRow key={sub.id} category={sub} depth={depth + 1} />
      ))}

      {/* Add subcategory form */}
      {showAddSub && expanded && (
        <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-800" style={{ paddingLeft: `${40 + (depth + 1) * 24}px` }}>
          <CategoryForm parentId={category.id} onClose={() => setShowAddSub(false)} />
        </div>
      )}

      <ConfirmationDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete Category"
        description={`Delete "${category.name}"? ${hasChildren ? 'This will fail if it has subcategories — remove them first.' : 'This cannot be undone.'}`}
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
      />
    </>
  );
}

// ─── Categories Page ────────────────────────────────────────────────────────

export function CategoriesPage() {
  const { data, isLoading } = useCategoryTree();
  const [showAdd, setShowAdd] = useState(false);

  const tree = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Categories"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Categories' }]}
        description="Manage product categories and subcategories."
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> New Category
          </Button>
        }
      />

      {showAdd && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <CategoryForm onClose={() => setShowAdd(false)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          ) : tree.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-zinc-400">
              No categories yet. Click "New Category" to get started.
            </div>
          ) : (
            tree.map((cat) => <CategoryRow key={cat.id} category={cat} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
