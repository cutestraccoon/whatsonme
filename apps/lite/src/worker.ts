/// <reference lib="webworker" />
import type { ParseResult, Report } from '@bigbrother/core';
import { runParse } from './parse';

export type InMsg = { type: 'parse'; files: File[]; tz: string; prior?: ParseResult[] };
export type OutMsg = { type: 'ready' } | { type: 'progress'; msg: string } | { type: 'done'; results: ParseResult[]; report: Report } | { type: 'error'; msg: string };

const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m);
self.onmessage = async (ev: MessageEvent<InMsg>) => {
  try { const { files, tz, prior = [] } = ev.data; const { results, report } = await runParse(files, tz, prior, (msg) => post({ type: 'progress', msg })); post({ type: 'done', results, report }); }
  catch (e) { post({ type: 'error', msg: (e as Error).message }); }
};
post({ type: 'ready' });
