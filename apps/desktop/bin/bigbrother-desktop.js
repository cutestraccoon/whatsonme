#!/usr/bin/env node
// Thin launcher: runs the TypeScript server via tsx.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, ['--import', 'tsx', join(here, '..', 'src', 'server.ts')], { stdio: 'inherit', env: process.env });
child.on('exit', (c) => process.exit(c ?? 0));
