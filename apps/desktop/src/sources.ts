import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectBrowserDbs, isWsl } from './collectors/browser.ts';

export interface SourceInfo {
  id: string;            // stable id passed back to POST /api/collect
  label: string;
  path: string;
  bytes: number;
  kind: 'collector' | 'archive';
  source: string;        // which parser/collector will handle it
}

/** Filename patterns for export archives people leave in ~/Downloads. */
const ARCHIVE_PATTERNS: { source: string; label: string; re: RegExp }[] = [
  { source: 'apple', label: 'Apple Health export', re: /^apple_health_export.*\.zip$|^export\.xml$/i },
  { source: 'google', label: 'Google Takeout', re: /^takeout-.*\.(zip|tgz)$/i },
  { source: 'instagram', label: 'Instagram export', re: /^instagram-.*\.zip$/i },
  { source: 'tiktok', label: 'TikTok export', re: /^user_data_tiktok.*\.(zip|json)$/i },
  { source: 'spotify', label: 'Spotify data', re: /^my_spotify_data.*\.zip$/i },
  { source: 'x', label: 'X / Twitter archive', re: /twitter.*\.zip$|^x-.*\.zip$/i },
  { source: 'snapchat', label: 'Snapchat export', re: /^mydata.*\.zip$/i },
  { source: 'uber', label: 'Uber export', re: /^uber-.*\.zip$/i },
  { source: 'whatsapp', label: 'WhatsApp chat export', re: /^whatsapp chat.*\.txt$/i },
];

function statSafe(p: string) { try { return fs.statSync(p); } catch { return undefined; } }

/** Folders to scan for export files: ~/Downloads, ~/Desktop, plus Windows user Downloads under WSL. */
export function downloadDirs(home = os.homedir()): string[] {
  const dirs = [path.join(home, 'Downloads'), path.join(home, 'Desktop')];
  if (isWsl()) {
    try {
      for (const u of fs.readdirSync('/mnt/c/Users')) {
        if (['Public', 'Default', 'Default User', 'All Users'].includes(u)) continue;
        dirs.push(path.join('/mnt/c/Users', u, 'Downloads'), path.join('/mnt/c/Users', u, 'Desktop'));
      }
    } catch { /* no windows drive */ }
  }
  return dirs.filter((d) => statSafe(d)?.isDirectory());
}

/** Only stats paths; never opens or reads file contents. */
export function detectSources(home = os.homedir()): SourceInfo[] {
  const out: SourceInfo[] = [];
  for (const db of detectBrowserDbs(home)) {
    const label = `${cap(db.browser)} history${db.profile && db.profile !== 'Default' ? ` (${db.profile})` : ''}${db.path.startsWith('/mnt/c/') ? ' [Windows]' : ''}`;
    out.push({ id: 'browser:' + db.path, label, path: db.path, bytes: db.bytes, kind: 'collector', source: 'browser' });
  }
  for (const dir of downloadDirs(home)) {
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      const hit = ARCHIVE_PATTERNS.find((p) => p.re.test(n));
      if (!hit) continue;
      const full = path.join(dir, n);
      const st = statSafe(full);
      if (!st?.isFile()) continue;
      out.push({ id: 'archive:' + full, label: `${hit.label}: ${n}`, path: full, bytes: st.size, kind: 'archive', source: hit.source });
    }
  }
  return out;
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
