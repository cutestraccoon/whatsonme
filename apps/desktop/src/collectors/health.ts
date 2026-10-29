import path from 'node:path';
import { parseAll, type ParseResult } from '../core.ts';
import { openLocalArchive } from './archive.ts';

/**
 * Apple Health: takes apple_health_export.zip (from the Health app) or an already-extracted export.xml,
 * and hands it to core's apple parser via parseAll. The parser matches `export.xml` by name.
 */
export async function collectAppleHealth(p: string, onProgress?: (msg: string) => void): Promise<ParseResult> {
  const { archive, mode } = await openLocalArchive(p);
  const results = await parseAll(archive, onProgress);
  const apple = results.find((r) => r.source === 'apple');
  if (apple) { apple.warnings.push(`health: read via ${mode} from ${path.basename(p)}`); return apple; }
  return { source: 'apple', events: [], claims: [], files: [], warnings: [`health: no export.xml found in ${p}`] };
}
