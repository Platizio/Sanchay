import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/db/migrate.js';

/**
 * postgres:18.6-trixie, pinned to the same index digest as compose.yaml (resolved 2026-09-25).
 * The `name@digest` form (no tag) is used because Testcontainers' ImageName.fromString splits on '@'.
 */
const PG_IMAGE = 'postgres@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722';
const TEMPLATE_DB = 'sanchay_template';
let container: StartedPostgreSqlContainer | undefined;

/** Starts one PostgreSQL 18 container and migrates a template database once per run. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer(PG_IMAGE)
    .withDatabase(TEMPLATE_DB)
    .withUsername('sanchay')
    .withPassword('sanchay_test_only')
    .start();
  await runMigrations(container.getConnectionUri());
  const admin = new URL(container.getConnectionUri());
  admin.pathname = '/postgres';
  project.provide('pgAdminUrl', admin.toString());
  project.provide('pgTemplateDb', TEMPLATE_DB);
  return async () => {
    await container?.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    pgTemplateDb: string;
  }
}
