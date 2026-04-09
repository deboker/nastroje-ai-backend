import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().default('*'),
  OPEN_SITE_REGISTRATION: z.enum(['true', 'false']).default('false'),
  DEFAULT_LANGUAGE: z.string().default('sk'),
});

export const env = envSchema.parse(process.env);
