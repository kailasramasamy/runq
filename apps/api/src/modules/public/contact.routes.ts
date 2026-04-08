import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sendEmail } from '../../utils/email';

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  company: z.string().max(200).optional(),
  message: z.string().min(10).max(2000),
  _hp: z.string().max(0).optional(), // honeypot — must be empty
});

const RECIPIENT = 'hello@quartex.in';

export const contactRoutes: FastifyPluginAsync = async (app) => {
  app.post('/contact', async (request, reply) => {
    const input = contactSchema.parse(request.body);

    // Honeypot check — bots fill hidden fields
    if (input._hp) {
      // Silently accept to not tip off the bot
      return reply.status(200).send({ ok: true });
    }

    const html = [
      '<h2>New Contact Form Submission — runQ Website</h2>',
      `<p><strong>Name:</strong> ${escapeHtml(input.name)}</p>`,
      `<p><strong>Email:</strong> ${escapeHtml(input.email)}</p>`,
      input.phone ? `<p><strong>Phone:</strong> ${escapeHtml(input.phone)}</p>` : '',
      input.company ? `<p><strong>Company:</strong> ${escapeHtml(input.company)}</p>` : '',
      `<hr />`,
      `<p>${escapeHtml(input.message).replace(/\n/g, '<br />')}</p>`,
      `<hr />`,
      `<p style="color:#999;font-size:12px">Sent from runq.in contact form</p>`,
    ].join('\n');

    const sent = await sendEmail({
      to: RECIPIENT,
      subject: `[runQ Contact] ${input.name} — ${input.company || 'No company'}`,
      html,
      text: `Name: ${input.name}\nEmail: ${input.email}\nPhone: ${input.phone || '-'}\nCompany: ${input.company || '-'}\n\n${input.message}`,
    });

    if (!sent) {
      app.log.warn({ input: { name: input.name, email: input.email } }, 'Contact email not sent (SMTP not configured), logged instead');
    }

    return { ok: true };
  });
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
