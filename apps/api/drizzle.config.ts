import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/modules/*/*.schema.ts',
    './src/modules/*/*/*.schema.ts',
    './src/integrations/*/*.schema.ts',
  ],
  out: './drizzle',
  schemaFilter: ['app'],
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  strict: true,
  verbose: true,
});
