import { describe, expect, it } from 'vitest';
import { generateOpenApiDocument } from './openapi.js';

describe('generateOpenApiDocument', () => {
  it('emits OpenAPI 3.1 with the health routes and the /api/v1 server', async () => {
    const doc = await generateOpenApiDocument();
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.info).toMatchObject({ title: 'Sanchay API', version: '1.0.0' });
    expect(doc.servers).toEqual([{ url: '/api/v1' }]);
    expect(doc.paths?.['/health']?.get).toBeDefined();
    expect(doc.paths?.['/health/ready']?.get).toBeDefined();
  });
});
