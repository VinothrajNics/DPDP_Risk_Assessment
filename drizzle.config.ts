import type { Config } from 'drizzle-kit';

export default {
  schema: './database/schema/index.ts',
  out: './database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.LOCAL_DB_PATH || './database/local.db',
  },
} satisfies Config;
