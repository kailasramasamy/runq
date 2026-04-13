import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  SERVICE_JWT_SECRET: z.string().min(32),
  PORTAL_JWT_SECRET: z.string().min(32).optional(),
  CA_PORTAL_SECRET: z.string().min(32).optional(),
  CORS_ORIGIN: z.string().optional(),
  WEBHOOK_SHARED_SECRET: z.string().min(16).optional(),
  SERVICE_JWT_EXPIRES_IN: z.string().default('5m'),
  PORT: z.coerce.number().default(3003),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MAIL_FROM: z.string().email().default('noreply@runq.in'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().transform(v => v === 'true').default('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_DEBUG: z.string().transform(v => v === 'true').default('false'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = result.data;
  return cached;
}
