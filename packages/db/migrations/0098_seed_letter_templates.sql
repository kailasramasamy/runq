-- Seed the standard set of HR letter templates for every existing tenant.
-- Each template uses the {{company.*}} letterhead block + {{employee.*}}
-- fields and ends with an HR signatory block (signature image URL is
-- exposed via {{hr.signatureImageUrl}} for future PDF rendering — the
-- plain-text body uses a typed signature pattern).
--
-- Idempotent: skips a (tenant_id, kind, name) that already exists, so it's
-- safe to re-run and won't overwrite a tenant's customised template.

DO $$
DECLARE
  t RECORD;
  v_letterhead text := E'{{company.legalName}}\n{{company.addressBlock}}\n' ||
                       E'{{#if company.gstin}}GSTIN: {{company.gstin}}{{/if}}\n\n' ||
                       E'Date: {{date.todayLong}}\n\n';
  v_signature text := E'\n\nSincerely,\n\n' ||
                      E'_____________________________\n' ||
                      E'{{hr.signatoryName}}\n' ||
                      E'{{hr.signatoryDesignation}}\n' ||
                      E'{{company.legalName}}';
BEGIN
  FOR t IN SELECT id FROM tenants WHERE deleted_at IS NULL LOOP

    -- Offer letter
    INSERT INTO letter_templates (tenant_id, name, kind, subject, body)
    SELECT t.id, 'Standard offer letter', 'offer',
      'Offer of employment — {{employee.fullName}}',
      v_letterhead ||
      E'To,\n{{employee.fullName}}\n\n' ||
      E'Dear {{employee.firstName}},\n\n' ||
      E'We are pleased to offer you the position at {{company.legalName}}, effective {{employee.joiningDate}}. ' ||
      E'Your annual CTC will be ₹{{employee.ctcAnnual}}.\n\n' ||
      E'Detailed terms and conditions of employment are enclosed separately. Please confirm your acceptance ' ||
      E'by replying to this letter.\n\n' ||
      E'We look forward to a long and rewarding association with you.' ||
      v_signature
    WHERE NOT EXISTS (
      SELECT 1 FROM letter_templates lt
      WHERE lt.tenant_id = t.id AND lt.kind = 'offer' AND lt.name = 'Standard offer letter'
    );

    -- Appointment letter
    INSERT INTO letter_templates (tenant_id, name, kind, subject, body)
    SELECT t.id, 'Standard appointment letter', 'appointment',
      'Appointment letter — {{employee.fullName}}',
      v_letterhead ||
      E'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' ||
      E'Dear {{employee.firstName}},\n\n' ||
      E'With reference to your acceptance of our offer dated {{employee.joiningDate}}, we are pleased to ' ||
      E'confirm your appointment with {{company.legalName}}.\n\n' ||
      E'Your annual CTC is ₹{{employee.ctcAnnual}}. The detailed compensation structure, leave policy, code of ' ||
      E'conduct and other terms of employment are governed by the company''s HR policy.\n\n' ||
      E'We welcome you to {{company.legalName}} and wish you a fulfilling career with us.' ||
      v_signature
    WHERE NOT EXISTS (
      SELECT 1 FROM letter_templates lt
      WHERE lt.tenant_id = t.id AND lt.kind = 'appointment' AND lt.name = 'Standard appointment letter'
    );

    -- Confirmation letter (post-probation)
    INSERT INTO letter_templates (tenant_id, name, kind, subject, body)
    SELECT t.id, 'Confirmation of employment', 'confirmation',
      'Confirmation of employment — {{employee.fullName}}',
      v_letterhead ||
      E'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' ||
      E'Dear {{employee.firstName}},\n\n' ||
      E'We are pleased to inform you that, based on your performance during the probation period, your ' ||
      E'services with {{company.legalName}} stand confirmed with effect from {{date.todayLong}}.\n\n' ||
      E'All other terms and conditions of your employment remain unchanged. We thank you for your ' ||
      E'contributions and look forward to your continued commitment.' ||
      v_signature
    WHERE NOT EXISTS (
      SELECT 1 FROM letter_templates lt
      WHERE lt.tenant_id = t.id AND lt.kind = 'confirmation' AND lt.name = 'Confirmation of employment'
    );

    -- Increment / revision letter
    INSERT INTO letter_templates (tenant_id, name, kind, subject, body)
    SELECT t.id, 'Salary revision letter', 'increment',
      'Salary revision — {{employee.fullName}}',
      v_letterhead ||
      E'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' ||
      E'Dear {{employee.firstName}},\n\n' ||
      E'In recognition of your performance and contribution to {{company.legalName}}, your annual CTC has ' ||
      E'been revised to ₹{{employee.ctcAnnual}} with effect from {{date.todayLong}}.\n\n' ||
      E'All other terms and conditions of your employment remain unchanged. Congratulations and keep up ' ||
      E'the good work.' ||
      v_signature
    WHERE NOT EXISTS (
      SELECT 1 FROM letter_templates lt
      WHERE lt.tenant_id = t.id AND lt.kind = 'increment' AND lt.name = 'Salary revision letter'
    );

    -- Experience letter
    INSERT INTO letter_templates (tenant_id, name, kind, subject, body)
    SELECT t.id, 'Experience letter', 'experience',
      'Experience letter — {{employee.fullName}}',
      v_letterhead ||
      E'TO WHOMSOEVER IT MAY CONCERN\n\n' ||
      E'This is to certify that {{employee.fullName}} (Employee Code: {{employee.employeeCode}}) was ' ||
      E'associated with {{company.legalName}} from {{employee.joiningDate}}.\n\n' ||
      E'During the tenure with us, {{employee.firstName}} was found to be sincere, hardworking and ' ||
      E'professional in approach. We wish {{employee.firstName}} all the best for future endeavours.' ||
      v_signature
    WHERE NOT EXISTS (
      SELECT 1 FROM letter_templates lt
      WHERE lt.tenant_id = t.id AND lt.kind = 'experience' AND lt.name = 'Experience letter'
    );

    -- Relieving letter
    INSERT INTO letter_templates (tenant_id, name, kind, subject, body)
    SELECT t.id, 'Relieving letter', 'relieving',
      'Relieving letter — {{employee.fullName}}',
      v_letterhead ||
      E'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' ||
      E'Dear {{employee.firstName}},\n\n' ||
      E'This is to confirm that you have been relieved from the services of {{company.legalName}} with ' ||
      E'effect from {{date.todayLong}} on completion of all formalities.\n\n' ||
      E'We thank you for your service and wish you success in your future endeavours.' ||
      v_signature
    WHERE NOT EXISTS (
      SELECT 1 FROM letter_templates lt
      WHERE lt.tenant_id = t.id AND lt.kind = 'relieving' AND lt.name = 'Relieving letter'
    );

    -- Salary certificate
    INSERT INTO letter_templates (tenant_id, name, kind, subject, body)
    SELECT t.id, 'Salary certificate', 'salary_certificate',
      'Salary certificate — {{employee.fullName}}',
      v_letterhead ||
      E'TO WHOMSOEVER IT MAY CONCERN\n\n' ||
      E'This is to certify that {{employee.fullName}} (Employee Code: {{employee.employeeCode}}, ' ||
      E'PAN: {{employee.pan}}) is employed with {{company.legalName}} since {{employee.joiningDate}}.\n\n' ||
      E'The current annual gross salary (CTC) is ₹{{employee.ctcAnnual}}.\n\n' ||
      E'This certificate is issued on the request of the employee for {{request.reason}} and should not ' ||
      E'be construed as an offer or extension of employment beyond the dates mentioned herein.' ||
      v_signature
    WHERE NOT EXISTS (
      SELECT 1 FROM letter_templates lt
      WHERE lt.tenant_id = t.id AND lt.kind = 'salary_certificate' AND lt.name = 'Salary certificate'
    );

    -- Address proof
    INSERT INTO letter_templates (tenant_id, name, kind, subject, body)
    SELECT t.id, 'Address proof / employment verification', 'address_proof',
      'Employment & address verification — {{employee.fullName}}',
      v_letterhead ||
      E'TO WHOMSOEVER IT MAY CONCERN\n\n' ||
      E'This is to certify that {{employee.fullName}} (Employee Code: {{employee.employeeCode}}) is a ' ||
      E'bona-fide employee of {{company.legalName}} since {{employee.joiningDate}} and is currently ' ||
      E'working at our office located at:\n\n' ||
      E'{{company.addressBlock}}\n\n' ||
      E'This letter is issued at the request of the employee for {{request.reason}}.' ||
      v_signature
    WHERE NOT EXISTS (
      SELECT 1 FROM letter_templates lt
      WHERE lt.tenant_id = t.id AND lt.kind = 'address_proof' AND lt.name = 'Address proof / employment verification'
    );

    -- Generic "Other" template
    INSERT INTO letter_templates (tenant_id, name, kind, subject, body)
    SELECT t.id, 'General letter', 'other',
      'Letter — {{employee.fullName}}',
      v_letterhead ||
      E'To,\n{{employee.fullName}}\nEmployee Code: {{employee.employeeCode}}\n\n' ||
      E'Dear {{employee.firstName}},\n\n' ||
      E'<Add the letter body here. The {{request.reason}} token captures what the employee asked for.>' ||
      v_signature
    WHERE NOT EXISTS (
      SELECT 1 FROM letter_templates lt
      WHERE lt.tenant_id = t.id AND lt.kind = 'other' AND lt.name = 'General letter'
    );

  END LOOP;
END $$;
