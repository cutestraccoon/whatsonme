/** Opt-in persistence in IndexedDB (this browser only). Off by default; "Forget everything" clears it. */
import type { ParseResult } from '@bigbrother/core';
const DB = 'bigbrother', STORE = 'kv';
function open(): Promise<IDBDatabase> { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function put(k: string, v: unknown) { const db = await open(); await new Promise<void>((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); db.close(); }
async function get<T>(k: string): Promise<T | undefined> { const db = await open(); const v = await new Promise<T | undefined>((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); db.close(); return v; }
export async function saveResults(rs: ParseResult[]) { try { await put('results', rs); await put('keep', true); } catch { /* storage unavailable */ } }
export async function loadResults(): Promise<ParseResult[] | null> { try { if (!(await get<boolean>('keep'))) return null; return (await get<ParseResult[]>('results')) ?? null; } catch { return null; } }
export async function clearAll() { try { await new Promise<void>((res) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = () => res(); r.onerror = () => res(); r.onblocked = () => res(); }); } catch { /* ignore */ } }
export async function keepEnabled() { try { return !!(await get<boolean>('keep')); } catch { return false; } }
