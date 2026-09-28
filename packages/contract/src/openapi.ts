import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { contract } from './index.js';

export type OpenApiDocument = Awaited<ReturnType<OpenAPIGenerator['generate']>>;

/** oRPC 1.x API: `schemaConverters` and top-level `info`/`servers` (not the v2 `converters`/`base`). */
export async function generateOpenApiDocument(): Promise<OpenApiDocument> {
  const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });
  return generator.generate(contract, {
    info: { title: 'Sanchay API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
  });
}
