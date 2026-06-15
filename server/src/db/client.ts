import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

export const sql = postgres(env.DATABASE_URL, {
  max: process.env.VERCEL ? 1 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
  ssl: 'require',
});

export const db = drizzle(sql, { schema });
