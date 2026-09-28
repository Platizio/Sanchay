import { writeFileSync } from 'node:fs';
import { generateOpenApiDocument } from '@sanchay/contract/openapi';

const doc = await generateOpenApiDocument();
writeFileSync(new URL('../openapi.json', import.meta.url), `${JSON.stringify(doc, null, 2)}\n`);
console.log('wrote apps/api/openapi.json');
