import type { MapArchive } from '../util/archive.js';
import { ARTISTS, INTERESTS, TRACKS, archive, iso, json, randomTs, rng, sqlTs } from './_rng.js';

/** Spotify "Download your data" + extended streaming history, as the zip lays them out. */
export function makeSpotifyArchive(): MapArchive {
  const r = rng(42);
  // account data (1 year): endTime is "YYYY-MM-DD HH:MM"
  const short = Array.from({ length: 120 }, () => {
    const ms = r.chance(0.2) ? r.int(1000, 25000) : r.int(90000, 300000);
    return { endTime: sqlTs(randomTs(r)).slice(0, 16), artistName: r.pick(ARTISTS), trackName: r.pick(TRACKS), msPlayed: ms };
  });
  // extended history
  const ext = Array.from({ length: 160 }, () => {
    const skipped = r.chance(0.25); const ms = skipped ? r.int(500, 20000) : r.int(120000, 320000);
    const artist = r.pick(ARTISTS);
    return {
      ts: iso(randomTs(r)).replace(/\.\d{3}Z$/, 'Z'), platform: r.pick(['android', 'ios', 'web_player', 'osx']), ms_played: ms, conn_country: 'CA',
      ip_addr: `99.2${r.int(10, 55)}.${r.int(0, 255)}.${r.int(0, 255)}`,
      master_metadata_track_name: r.pick(TRACKS), master_metadata_album_artist_name: artist, master_metadata_album_album_name: artist + ' LP',
      spotify_track_uri: 'spotify:track:' + r.int(1e9, 9e9).toString(36), episode_name: null, episode_show_name: null, spotify_episode_uri: null,
      reason_start: r.pick(['trackdone', 'clickrow', 'fwdbtn']), reason_end: skipped ? 'fwdbtn' : 'trackdone', shuffle: r.chance(0.5), skipped, offline: r.chance(0.1), offline_timestamp: 0, incognito_mode: false,
    };
  });
  return archive({
    'Spotify Account Data/StreamingHistory_music_0.json': json(short.slice(0, 60)),
    'Spotify Account Data/StreamingHistory_music_1.json': json(short.slice(60)),
    'Spotify Account Data/Userdata.json': json({ username: 'ferriswheel_to', email: 'ferris@example.com', country: 'CA', createdFromFacebook: false, birthdate: '1996-04-12', gender: 'male', postalCode: 'M3C', mobileNumber: '+14165551234', creationTime: '2015-06-02' }),
    'Spotify Account Data/Identity.json': json({ displayName: 'Ferris', firstName: 'F', lastName: 'W', imageUrl: '', largeImageUrl: '', tasteMaker: false, verified: false }),
    'Spotify Account Data/Inferences.json': json(INTERESTS.map((i) => `1P_Custom_${i.replace(/ /g, '_')}`).concat(['3P_Auto_Intenders', 'Spotify_Segment_Night_Owls'])),
    'Spotify Account Data/Playlist1.json': json({ playlists: [] }),
    'Spotify Extended Streaming History/Streaming_History_Audio_2024_0.json': json(ext),
    'Spotify Extended Streaming History/ReadMeFirst_ExtendedStreamingHistory.pdf': new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  });
}
