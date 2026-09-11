import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from '@db/schema';
import { runQuery } from './driver';

export const db = drizzle(runQuery, { schema });

export * from './driver';
export { schema };
