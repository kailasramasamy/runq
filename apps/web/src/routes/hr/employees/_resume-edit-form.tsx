import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button, useToast } from '@/components/ui';
import type {
  ResumeProfile, ResumeExperience, ResumeEducation, ResumeCertification,
} from '@runq/types';
import { useUpdateResumeProfile } from '@/hooks/queries/use-resume-profile';
import { SectionLabel } from './_employee-tabs';

const INPUT_CLS = 'w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none';
const inputStyle = {
  borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)',
} as const;

function TextField({
  label, value, onChange, placeholder, textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${INPUT_CLS} mt-1 resize-y`}
          style={inputStyle}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${INPUT_CLS} mt-1`}
          style={inputStyle}
        />
      )}
    </label>
  );
}

/** Enter-to-add chip editor for plain string lists (skills, languages). */
function ChipEditor({
  items, onChange, placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={`${it}-${i}`}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px]"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            {it}
            <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label={`Remove ${it}`}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
        className={`${INPUT_CLS} mt-2`}
        style={inputStyle}
      />
    </div>
  );
}

/** A removable card wrapper for one repeatable entry. */
function EntryCard({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div
      className="relative rounded-lg border p-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 rounded p-0.5 hover:bg-[color:var(--surface-2)]"
        style={{ color: 'var(--neg)' }}
        aria-label="Remove entry"
      >
        <Trash2 size={13} />
      </button>
      <div className="grid grid-cols-2 gap-2.5 pr-6">{children}</div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1.5 text-[12px] font-medium"
      style={{ borderColor: 'var(--border)', color: 'var(--accent-text)' }}
    >
      <Plus size={13} /> {label}
    </button>
  );
}

const EMPTY_EXP: ResumeExperience = { company: '', title: null, fromDate: null, toDate: null, description: null };
const EMPTY_EDU: ResumeEducation = { degree: '', institution: null, year: null, grade: null };
const EMPTY_CERT: ResumeCertification = { name: '', issuer: null, year: null };

export function ResumeEditForm({
  employeeId, profile, onDone,
}: {
  employeeId: string;
  profile: ResumeProfile;
  onDone: () => void;
}) {
  const update = useUpdateResumeProfile(employeeId);
  const { toast } = useToast();

  const [summary, setSummary] = useState(profile.summary ?? '');
  const [totalExpYears, setTotalExpYears] = useState(profile.totalExpYears ?? '');
  const [experience, setExperience] = useState<ResumeExperience[]>(profile.experience);
  const [education, setEducation] = useState<ResumeEducation[]>(profile.education);
  const [certifications, setCertifications] = useState<ResumeCertification[]>(profile.certifications);
  const [skills, setSkills] = useState<string[]>(profile.skills);
  const [languages, setLanguages] = useState<string[]>(profile.languages);

  function patchExp(i: number, patch: Partial<ResumeExperience>) {
    setExperience((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function patchEdu(i: number, patch: Partial<ResumeEducation>) {
    setEducation((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function patchCert(i: number, patch: Partial<ResumeCertification>) {
    setCertifications((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function save() {
    const years = totalExpYears.toString().trim();
    update.mutate(
      {
        summary: summary.trim() || null,
        experience: experience.filter((e) => e.company.trim()),
        education: education.filter((e) => e.degree.trim()),
        certifications: certifications.filter((c) => c.name.trim()),
        skills: skills.map((s) => s.trim()).filter(Boolean),
        languages: languages.map((s) => s.trim()).filter(Boolean),
        totalExpYears: years ? Number(years) : null,
      },
      {
        onSuccess: () => { toast('Resume profile updated', 'success'); onDone(); },
        onError: (e: any) => toast(e?.message ?? 'Failed to save', 'error'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionLabel>Summary</SectionLabel>
        <TextField label="Professional summary" value={summary} onChange={setSummary} textarea
          placeholder="Short professional summary from the resume" />
        <div className="mt-2.5 w-40">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Total experience (years)
          </span>
          <input
            type="number" min={0} max={80} step={0.5}
            value={totalExpYears}
            onChange={(e) => setTotalExpYears(e.target.value)}
            className={`${INPUT_CLS} mt-1`}
            style={inputStyle}
          />
        </div>
      </section>

      <section>
        <SectionLabel>Experience</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {experience.map((exp, i) => (
            <EntryCard key={i} onRemove={() => setExperience((xs) => xs.filter((_, idx) => idx !== i))}>
              <TextField label="Company" value={exp.company} onChange={(v) => patchExp(i, { company: v })} />
              <TextField label="Title" value={exp.title ?? ''} onChange={(v) => patchExp(i, { title: v || null })} />
              <TextField label="From" value={exp.fromDate ?? ''} onChange={(v) => patchExp(i, { fromDate: v || null })}
                placeholder="YYYY or YYYY-MM" />
              <TextField label="To" value={exp.toDate ?? ''} onChange={(v) => patchExp(i, { toDate: v || null })}
                placeholder="YYYY, YYYY-MM or blank" />
              <div className="col-span-2">
                <TextField label="Description" value={exp.description ?? ''} textarea
                  onChange={(v) => patchExp(i, { description: v || null })} />
              </div>
            </EntryCard>
          ))}
          <AddButton label="Add experience" onClick={() => setExperience((xs) => [...xs, { ...EMPTY_EXP }])} />
        </div>
      </section>

      <section>
        <SectionLabel>Education</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {education.map((edu, i) => (
            <EntryCard key={i} onRemove={() => setEducation((xs) => xs.filter((_, idx) => idx !== i))}>
              <TextField label="Degree" value={edu.degree} onChange={(v) => patchEdu(i, { degree: v })} />
              <TextField label="Institution" value={edu.institution ?? ''}
                onChange={(v) => patchEdu(i, { institution: v || null })} />
              <TextField label="Year" value={edu.year ?? ''} onChange={(v) => patchEdu(i, { year: v || null })} />
              <TextField label="Grade" value={edu.grade ?? ''} onChange={(v) => patchEdu(i, { grade: v || null })}
                placeholder="CGPA / % / class" />
            </EntryCard>
          ))}
          <AddButton label="Add education" onClick={() => setEducation((xs) => [...xs, { ...EMPTY_EDU }])} />
        </div>
      </section>

      <section>
        <SectionLabel>Certifications</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {certifications.map((cert, i) => (
            <EntryCard key={i} onRemove={() => setCertifications((xs) => xs.filter((_, idx) => idx !== i))}>
              <TextField label="Name" value={cert.name} onChange={(v) => patchCert(i, { name: v })} />
              <TextField label="Issuer" value={cert.issuer ?? ''} onChange={(v) => patchCert(i, { issuer: v || null })} />
              <TextField label="Year" value={cert.year ?? ''} onChange={(v) => patchCert(i, { year: v || null })} />
            </EntryCard>
          ))}
          <AddButton label="Add certification" onClick={() => setCertifications((xs) => [...xs, { ...EMPTY_CERT }])} />
        </div>
      </section>

      <section>
        <SectionLabel>Skills</SectionLabel>
        <ChipEditor items={skills} onChange={setSkills} placeholder="Type a skill, press Enter" />
      </section>

      <section>
        <SectionLabel>Languages</SectionLabel>
        <ChipEditor items={languages} onChange={setLanguages} placeholder="Type a language, press Enter" />
      </section>

      <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <Button size="sm" variant="outline" onClick={onDone} disabled={update.isPending}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
