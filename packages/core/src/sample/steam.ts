import type { MapArchive } from '../util/archive.js';
import { archive, json, randomTs, rng, sqlTs } from './_rng.js';

const GAMES: [number, string][] = [[730, 'Counter-Strike 2'], [570, 'Dota 2'], [1245620, 'ELDEN RING'], [1086940, 'Baldur\'s Gate 3'], [292030, 'The Witcher 3: Wild Hunt'], [1172470, 'Apex Legends'], [413150, 'Stardew Valley'], [105600, 'Terraria'], [1091500, 'Cyberpunk 2077'], [1174180, 'Red Dead Redemption 2'], [271590, 'Grand Theft Auto V'], [1517290, 'Battlefield 2042'], [2050650, 'Resident Evil 4'], [1938090, 'Call of Duty'], [252490, 'Rust'], [945360, 'Among Us'], [1551360, 'Forza Horizon 5'], [550, 'Left 4 Dead 2'], [620, 'Portal 2'], [1222670, 'The Sims 4'], [814380, 'Sekiro'], [1593500, 'God of War'], [1817070, 'Marvel\'s Spider-Man'], [2358720, 'Black Myth: Wukong'], [1623730, 'Palworld'], [1966720, 'Lethal Company'], [881100, 'Noita'], [1794680, 'Vampire Survivors'], [648800, 'Raft'], [1057090, 'Ori and the Will of the Wisps'], [367520, 'Hollow Knight'], [1145360, 'Hades'], [848450, 'Subnautica: Below Zero'], [1942280, 'Brotato'], [1659040, 'HITMAN 3'], [1817190, 'Marvel\'s Spider-Man: Miles Morales'], [1446780, 'Monster Hunter Rise'], [1203220, 'Naraka'], [1364780, 'Street Fighter 6'], [1811260, 'EA SPORTS FC 24']];

/** Steam GDPR data export: a folder tree of CSV/JSON. */
export function makeSteamArchive(): MapArchive {
  const r = rng(76561);
  const playtime = GAMES.map(([appid, name]) => ({ appid, name, playtime_forever: r.chance(0.3) ? r.int(0, 60) : r.int(120, 9000), playtime_2weeks: r.chance(0.3) ? r.int(30, 600) : 0, last_played: Math.floor(randomTs(r) / 1000), platform: r.pick(['windows', 'windows', 'linux']) }));
  const logins = Array.from({ length: 45 }, () => `${sqlTs(randomTs(r))},${r.pick(['Login', 'Login', 'Logout', 'Password Change'])},99.2${r.int(10, 55)}.${r.int(0, 255)}.${r.int(0, 255)},CA,${r.pick(['Windows PC', 'Steam Deck', 'Mobile App'])}`);
  return archive({
    'Steam Data Export/Playtime/GameplayHistory.json': json({ games: playtime }),
    'Steam Data Export/AccountHistory/Logins.csv': ['Time,Action,IP,Country,Device', ...logins].join('\n') + '\n',
    'Steam Data Export/AccountInfo/AccountInfo.json': json({ steamid: '76561198000000000', persona_name: 'ferriswheel', email: 'ferris@example.com', country: 'CA', time_created: '2012-11-20 03:12:44' }),
    'Steam Data Export/Achievements/achievements.csv': 'appid,achievement,unlocked\n730,first_blood,2024-02-02 10:00:00\n',
    'Steam Data Export/README.txt': 'Steam personal data export',
  });
}
