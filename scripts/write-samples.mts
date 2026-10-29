import { sampleZips } from '../packages/core/src/index.ts';
import { mkdirSync, writeFileSync } from 'node:fs'; import { join } from 'node:path';
const out = process.argv[2] ?? 'sample-exports'; mkdirSync(out, { recursive: true });
for (const z of await sampleZips()) { writeFileSync(join(out, z.name), z.bytes); console.log(z.name, (z.bytes.length / 1024).toFixed(0) + ' KB'); }
