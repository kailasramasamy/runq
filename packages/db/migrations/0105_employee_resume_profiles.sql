-- Employee resume profiles — AI-extracted enrichment data lifted from an
-- employee's resume (summary, experience, education, skills, certifications).
-- One row per employee, populated opportunistically when a resume is uploaded
-- (manual upload on the employee detail page, or the onboarding checklist).
-- All data is self-reported and unverified — surfaced to management as a
-- read-only "from resume" block, never as an authoritative HR record.

-- extraction_corrections logs AI-vs-human edits; resume edits join the audit.
DO $$ BEGIN
  ALTER TYPE extraction_doc_type ADD VALUE IF NOT EXISTS 'hr_resume';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS employee_resume_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  summary text,
  experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  education jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_exp_years numeric(4,1),
  source_attachment_id uuid REFERENCES document_attachments(id),
  ai_confidence numeric(3,2),
  manually_edited boolean NOT NULL DEFAULT false,
  extracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_employee
  ON employee_resume_profiles (employee_id);
CREATE INDEX IF NOT EXISTS idx_resume_tenant
  ON employee_resume_profiles (tenant_id);
