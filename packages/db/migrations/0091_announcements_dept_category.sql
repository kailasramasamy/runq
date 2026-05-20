-- Announcements get two new dimensions: department scoping + category.
--
-- department_id (nullable):
--   NULL = org-wide (the existing behaviour).
--   Otherwise the row is targeted at a single department — production
--   floor, accounts, etc. The server-side feed returns rows where
--   department_id IS NULL OR department_id = caller's department, so an
--   employee outside that department never sees it.
--
-- category:
--   Visual + semantic tag the mobile feed renders as an icon + chip.
--   CHECK-constrained so a malformed POST can't slip a junk value into
--   the column.

ALTER TABLE hr_announcements
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

ALTER TABLE hr_announcements
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'general';

ALTER TABLE hr_announcements
  DROP CONSTRAINT IF EXISTS hr_announcements_category_check;
ALTER TABLE hr_announcements
  ADD CONSTRAINT hr_announcements_category_check
    CHECK (category IN ('general', 'policy', 'holiday', 'event',
                        'operational', 'celebration', 'payroll'));

CREATE INDEX IF NOT EXISTS idx_ann_tenant_dept
  ON hr_announcements (tenant_id, department_id);
