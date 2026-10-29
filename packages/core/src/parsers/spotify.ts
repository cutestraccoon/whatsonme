import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { byName, safeJson, toMs } from '../util/text.js';

/**
 * Spotify "Download your data". Two flavours of streaming history:
 *  - account data (1 year):  StreamingHistory_music_N.json  [{endTime "YYYY-MM-DD HH:MM", artistName, trackName, msPlayed}]
 *  - extended history:       Streaming_History_Audio_*.json [{ts ISO, ms_played, master_metadata_track_name, ...}]
 * Plus Userdata.json / Identity.json (declared profile) and Inferences.json (ad segments Spotify inferred).
 */
export const spotify: Parser = {
  source: 'spotify',
  detect: (paths) => paths.some((p) => /(^|\/)(streaminghistory[_a-z]*\d*|streaming_history_(audio|video)[^/]*|userdata|identity|inferences|yourlibrary)\.json$/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = a.list();
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    const read = async (p: string) => { files.push(p); return safeJson<any>(await a.text(p)); };

    // account-data streaming history (endTime is local time w/o zone; treat as UTC)
    for (const p of byName(paths, /(^|\/)streaminghistory[_a-z]*\d*\.json$/)) {
      const j = await read(p); if (!Array.isArray(j)) continue;
      for (const it of j) {
        const t = toMs(it?.endTime); if (!t) continue;
        const ms = Number(it.msPlayed) || 0;
        events.push({ ts: t - ms, source: 'spotify', kind: 'play', title: it.trackName ?? '', actor: it.artistName ?? '', value: ms, file: p, meta: { skipped: ms > 0 && ms < 30000 } });
      }
    }
    // extended streaming history
    for (const p of byName(paths, /(^|\/)streaming_history_(audio|video)[^/]*\.json$/)) {
      const j = await read(p); if (!Array.isArray(j)) continue;
      for (const it of j) {
        const t = toMs(it?.ts); if (!t) continue;
        const ms = Number(it.ms_played) || 0;
        const title = it.master_metadata_track_name ?? it.episode_name ?? it.audiobook_chapter_title ?? it.audiobook_title ?? '';
        const actor = it.master_metadata_album_artist_name ?? it.episode_show_name ?? it.audiobook_title ?? '';
        events.push({ ts: t, source: 'spotify', kind: 'play', title, actor, value: ms, file: p,
          meta: { skipped: !!it.skipped, shuffle: !!it.shuffle, offline: !!it.offline, platform: it.platform ?? '', country: it.conn_country ?? '', ip: maskIp(it.ip_addr ?? it.ip_addr_decrypted ?? ''), reason_start: it.reason_start ?? '', reason_end: it.reason_end ?? '', album: it.master_metadata_album_album_name ?? '' } });
        if (it.conn_country && !claims.some((c) => c.field === 'conn_country' && c.value === it.conn_country)) claims.push({ source: 'spotify', field: 'conn_country', value: String(it.conn_country), file: p });
      }
    }
    // declared profile
    for (const p of byName(paths, /(^|\/)(userdata|identity)\.json$/)) {
      const j = await read(p); if (!j || typeof j !== 'object') continue;
      const username = j.username ?? j.displayName ?? j.name;
      if (username) claims.push({ source: 'spotify', field: 'declared_username', value: String(username), file: p });
      if (j.email) claims.push({ source: 'spotify', field: 'declared_email', value: mask(String(j.email)), file: p });
      if (j.country) claims.push({ source: 'spotify', field: 'declared_country', value: String(j.country), file: p });
      const bd = String(j.birthdate ?? j.birthDate ?? ''); const yr = bd.match(/\d{4}/);
      if (yr) claims.push({ source: 'spotify', field: 'declared_birth_year', value: yr[0], file: p });
      if (j.gender) claims.push({ source: 'spotify', field: 'declared_gender', value: String(j.gender), file: p });
      if (j.creationTime) claims.push({ source: 'spotify', field: 'account_created', value: String(j.creationTime), file: p });
      if (j.mobileNumber) claims.push({ source: 'spotify', field: 'declared_phone', value: mask(String(j.mobileNumber)), file: p });
      if (j.postalCode) claims.push({ source: 'spotify', field: 'declared_postal_code', value: String(j.postalCode), file: p });
    }
    // inferences (ad segments)
    for (const p of byName(paths, /(^|\/)inferences\.json$/)) {
      const j = await read(p); const arr: unknown[] = Array.isArray(j) ? j : Array.isArray(j?.inferences) ? j.inferences : [];
      for (const s of arr) if (typeof s === 'string' && s.trim()) claims.push({ source: 'spotify', field: 'ad_interest', value: s.trim(), file: p });
    }
    if (!events.length && !claims.length) warnings.push('Spotify: archive recognized but no known files parsed.');
    onProgress?.(`Spotify: ${events.length} events, ${claims.length} claims`);
    return { source: 'spotify', events, claims, files, warnings } satisfies ParseResult;
  },
};

function mask(s: string) { return s.replace(/[^@. ](?=[^@. ]{2})/g, '•'); }
function maskIp(s: string) { if (!s) return ''; const v4 = s.split('.'); if (v4.length === 4) return `${v4[0]}.${v4[1]}.•.•`; const v6 = s.split(':'); return v6.length > 2 ? v6.slice(0, 2).join(':') + ':••' : '••'; }
