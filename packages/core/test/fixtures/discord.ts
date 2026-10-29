import type { MapArchive } from '../../src/util/archive.js';
import { CITIES, NAMES, archive, iso, json, randomTs, rng } from './_rng.js';

/** Discord's "2024-03-12 10:21:33.123000+00:00" */
const dts = (ms: number) => iso(ms).replace('T', ' ').replace(/(\.\d{3})Z$/, '$1000+00:00');

/** Discord data package: messages/, activity/analytics/, account/, servers/. */
export function makeDiscordArchive(): MapArchive {
  const r = rng(404);
  const channels = [
    { id: '1001', type: 1, name: '', guild: null, label: `Direct Message with ${NAMES[0].toLowerCase()}#1234`, n: 60 },
    { id: '1002', type: 1, name: '', guild: null, label: `Direct Message with ${NAMES[1].toLowerCase()}#0`, n: 40 },
    { id: '2001', type: 0, name: 'general', guild: { id: '9001', name: 'Toronto Founders' }, label: 'general in Toronto Founders', n: 55 },
    { id: '2002', type: 0, name: 'ai-builders', guild: { id: '9001', name: 'Toronto Founders' }, label: 'ai-builders in Toronto Founders', n: 35 },
    { id: '2003', type: 0, name: 'cs2', guild: { id: '9002', name: 'Gaming Lounge' }, label: 'cs2 in Gaming Lounge', n: 30 },
  ];
  const files: Record<string, string> = {
    'package/README.txt': 'Discord data package',
    'package/messages/index.json': json(Object.fromEntries(channels.map((c) => [c.id, c.label]))),
    'package/servers/index.json': json({ '9001': 'Toronto Founders', '9002': 'Gaming Lounge', '9003': 'Ollama' }),
    'package/account/user.json': json({ id: '1234', username: 'alexsample', discriminator: '0', global_name: 'Alex', email: 'alex@example.com', verified: true, phone: '+14165551234', ip: '203.0.113.7', flags: 64, connections: [{ type: 'spotify', name: 'alexsample_to' }, { type: 'steam', name: 'alexsample' }], relationships: Array.from({ length: 23 }, (_, i) => ({ id: String(5000 + i), type: i < 20 ? 1 : 3, user: { username: 'u' + i } })), payments: [{ id: 'p1', created_at: iso(randomTs(r)), amount: 1399, currency: 'cad', description: 'Nitro Monthly', status: 1 }] }),
  };
  for (const c of channels) {
    files[`package/messages/c${c.id}/channel.json`] = json({ id: c.id, type: c.type, name: c.name, ...(c.guild ? { guild: c.guild } : { recipients: ['1234', '5678'] }) });
    const msgs = Array.from({ length: c.n }, (_, i) => ({ ID: String(1200000000000000000 + i), Timestamp: dts(randomTs(r)), Contents: r.pick(['gg', 'anyone up for a game tonight?', 'check this out', 'lol', 'yeah I think the RTX 3070 handles it fine', ''] ), Attachments: r.chance(0.1) ? 'https://cdn.discordapp.com/attachments/1/2/img.png' : '' }));
    if (c.id === '2003') files[`package/messages/c${c.id}/messages.csv`] = ['ID,Timestamp,Contents,Attachments', ...msgs.map((m) => `${m.ID},${m.Timestamp},"${m.Contents}",${m.Attachments}`)].join('\n') + '\n';
    else files[`package/messages/c${c.id}/messages.json`] = json(msgs);
  }
  // analytics: NDJSON, mostly noise with some app_opened / session_start
  const types = ['app_opened', 'session_start', 'channel_opened', 'guild_viewed', 'message_sent', 'keyboard_shortcut_used', 'notification_clicked', 'voice_channel_joined', 'launch_game'];
  const ev = Array.from({ length: 600 }, () => { const type = r.pick(types); return JSON.stringify({ event_type: type, timestamp: dts(randomTs(r)), client_send_timestamp: dts(randomTs(r)), os: r.pick(['Windows', 'Windows', 'Android', 'iOS']), browser: 'Discord Client', ip: `99.2${r.int(10, 55)}.${r.int(0, 255)}.${r.int(0, 255)}`, city: r.pick(CITIES), country_code: 'CA', ...(type === 'launch_game' ? { game: 'Counter-Strike 2' } : {}) }); });
  files['package/activity/analytics/events-2024-00000-of-00001.json'] = ev.join('\n') + '\n';
  return archive(files);
}
