// Standard HR letter templates seeded for every new tenant.
//
// Keep the body strings in sync with packages/db/migrations/0098_seed_letter_templates.sql
// — that migration backfills existing tenants; this function covers new
// signups going forward.

import type { Db } from '@runq/db';
import { letterTemplates } from '@runq/db';

const LETTERHEAD =
  '{{company.legalName}}\n' +
  '{{company.addressBlock}}\n' +
  '{{#if company.gstin}}GSTIN: {{company.gstin}}{{/if}}\n' +
  '\nDate: {{date.todayLong}}\n\n';

const SIGNATURE =
  '\n\nSincerely,\n\n' +
  '_____________________________\n' +
  '{{hr.signatoryName}}\n' +
  '{{hr.signatoryDesignation}}\n' +
  '{{company.legalName}}';

type Seed = {
  name: string;
  kind: 'offer' | 'appointment' | 'confirmation' | 'increment' |
        'experience' | 'relieving' | 'salary_certificate' | 'address_proof' | 'other';
  subject: string;
  body: string;
};

const SEEDS: Seed[] = [
  {
    name: 'Standard offer letter',
    kind: 'offer',
    subject: 'Offer of employment — {{employee.fullName}}',
    body:
      LETTERHEAD +
      'To,\n{{employee.fullName}}\n\n' +
      'Dear {{employee.firstName}},\n\n' +
      'We are pleased to offer you the position at {{company.legalName}}, effective {{employee.joiningDate}}. ' +
      'Your annual CTC will be ₹{{employee.ctcAnnual}}.\n\n' +
      'Detailed terms and conditions of employment are enclosed separately. Please confirm your acceptance ' +
      'by replying to this letter.\n\n' +
      'We look forward to a long and rewarding association with you.' +
      SIGNATURE,
  },
  {
    name: 'Standard appointment letter',
    kind: 'appointment',
    subject: 'Appointment letter — {{employee.fullName}}',
    body:
      LETTERHEAD +
      'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' +
      'Dear {{employee.firstName}},\n\n' +
      'With reference to your acceptance of our offer dated {{employee.joiningDate}}, we are pleased to ' +
      'confirm your appointment with {{company.legalName}}.\n\n' +
      'Your annual CTC is ₹{{employee.ctcAnnual}}. The detailed compensation structure, leave policy, code of ' +
      'conduct and other terms of employment are governed by the company\'s HR policy.\n\n' +
      'We welcome you to {{company.legalName}} and wish you a fulfilling career with us.' +
      SIGNATURE,
  },
  {
    name: 'Confirmation of employment',
    kind: 'confirmation',
    subject: 'Confirmation of employment — {{employee.fullName}}',
    body:
      LETTERHEAD +
      'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' +
      'Dear {{employee.firstName}},\n\n' +
      'We are pleased to inform you that, based on your performance during the probation period, your ' +
      'services with {{company.legalName}} stand confirmed with effect from {{date.todayLong}}.\n\n' +
      'All other terms and conditions of your employment remain unchanged. We thank you for your ' +
      'contributions and look forward to your continued commitment.' +
      SIGNATURE,
  },
  {
    name: 'Salary revision letter',
    kind: 'increment',
    subject: 'Salary revision — {{employee.fullName}}',
    body:
      LETTERHEAD +
      'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' +
      'Dear {{employee.firstName}},\n\n' +
      'In recognition of your performance and contribution to {{company.legalName}}, your annual CTC has ' +
      'been revised to ₹{{employee.ctcAnnual}} with effect from {{date.todayLong}}.\n\n' +
      'All other terms and conditions of your employment remain unchanged. Congratulations and keep up ' +
      'the good work.' +
      SIGNATURE,
  },
  {
    name: 'Experience letter',
    kind: 'experience',
    subject: 'Experience letter — {{employee.fullName}}',
    body:
      LETTERHEAD +
      'TO WHOMSOEVER IT MAY CONCERN\n\n' +
      'This is to certify that {{employee.fullName}} (Employee Code: {{employee.employeeCode}}) was ' +
      'associated with {{company.legalName}} from {{employee.joiningDate}}.\n\n' +
      'During the tenure with us, {{employee.firstName}} was found to be sincere, hardworking and ' +
      'professional in approach. We wish {{employee.firstName}} all the best for future endeavours.' +
      SIGNATURE,
  },
  {
    name: 'Relieving letter',
    kind: 'relieving',
    subject: 'Relieving letter — {{employee.fullName}}',
    body:
      LETTERHEAD +
      'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' +
      'Dear {{employee.firstName}},\n\n' +
      'This is to confirm that you have been relieved from the services of {{company.legalName}} with ' +
      'effect from {{date.todayLong}} on completion of all formalities.\n\n' +
      'We thank you for your service and wish you success in your future endeavours.' +
      SIGNATURE,
  },
  {
    name: 'Salary certificate',
    kind: 'salary_certificate',
    subject: 'Salary certificate — {{employee.fullName}}',
    body:
      LETTERHEAD +
      'TO WHOMSOEVER IT MAY CONCERN\n\n' +
      'This is to certify that {{employee.fullName}} (Employee Code: {{employee.employeeCode}}, ' +
      'PAN: {{employee.pan}}) is employed with {{company.legalName}} since {{employee.joiningDate}}.\n\n' +
      'The current annual gross salary (CTC) is ₹{{employee.ctcAnnual}}.\n\n' +
      'This certificate is issued on the request of the employee for {{request.reason}} and should not ' +
      'be construed as an offer or extension of employment beyond the dates mentioned herein.' +
      SIGNATURE,
  },
  {
    name: 'Address proof / employment verification',
    kind: 'address_proof',
    subject: 'Employment & address verification — {{employee.fullName}}',
    body:
      LETTERHEAD +
      'TO WHOMSOEVER IT MAY CONCERN\n\n' +
      'This is to certify that {{employee.fullName}} (Employee Code: {{employee.employeeCode}}) is a ' +
      'bona-fide employee of {{company.legalName}} since {{employee.joiningDate}} and is currently ' +
      'working at our office located at:\n\n' +
      '{{company.addressBlock}}\n\n' +
      'This letter is issued at the request of the employee for {{request.reason}}.' +
      SIGNATURE,
  },
  {
    name: 'General letter',
    kind: 'other',
    subject: 'Letter — {{employee.fullName}}',
    body:
      LETTERHEAD +
      'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' +
      'Dear {{employee.firstName}},\n\n' +
      '<Add the letter body here. The {{request.reason}} token captures what the employee asked for.>' +
      SIGNATURE,
  },
];

// Call once at tenant creation. Idempotency relies on the caller — this
// function unconditionally inserts; calling it twice will duplicate.
export async function seedDefaultLetterTemplates(db: Db, tenantId: string): Promise<void> {
  await db.insert(letterTemplates).values(
    SEEDS.map((s) => ({
      tenantId,
      name: s.name,
      kind: s.kind,
      subject: s.subject,
      body: s.body,
    })),
  );
}
