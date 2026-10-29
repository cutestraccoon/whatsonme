/** Normalized event: every parser emits these. */
export type Source =
  | 'instagram' | 'tiktok' | 'google' | 'youtube' | 'apple' | 'spotify' | 'x' | 'snapchat'
  | 'uber' | 'whatsapp' | 'tinder' | 'hinge' | 'bumble' | 'steam' | 'discord' | 'browser' | 'health' | 'unknown';

export type Kind =
  | 'watch' | 'like' | 'save' | 'share' | 'comment' | 'post' | 'message' | 'search' | 'visit'
  | 'ad_view' | 'ad_click' | 'off_platform' | 'login' | 'location' | 'trip' | 'play' | 'purchase'
  | 'install' | 'swipe' | 'match' | 'session' | 'health' | 'other';

export interface Event {
  ts: number;            // unix ms (UTC)
  source: Source;
  kind: Kind;
  title?: string;        // human label (video title, search query, place name)
  url?: string;
  actor?: string;        // author / channel / counterpart
  value?: number;        // ms played, distance, steps, etc.
  lat?: number; lon?: number;
  meta?: Record<string, string | number | boolean | null | undefined>;
  file: string;          // receipt: path inside the export it came from
}

/** Facts the platform itself asserted about the user (not derived by us). */
export interface Claim {
  source: Source;
  field: string;         // e.g. 'inferred_age', 'ad_interest', 'profile_based_in', 'advertiser_upload'
  value: string;
  confidence?: number;   // 0..1 when the platform gave one
  meta?: Record<string, string | number | boolean | null | undefined>;
  file: string;
}

export interface ParseResult {
  source: Source;
  events: Event[];
  claims: Claim[];
  files: string[];       // files recognized
  warnings: string[];
}

/** Abstract archive: zip in browser, folder in Node. */
export interface Archive {
  /** lower-cased, forward-slash relative paths */
  list(): string[];
  text(path: string): Promise<string>;
  bytes(path: string): Promise<Uint8Array>;
  size(path: string): number;
}

export interface Parser {
  source: Source;
  /** cheap detection from the file list only */
  detect(paths: string[]): boolean;
  parse(archive: Archive, onProgress?: (msg: string) => void): Promise<ParseResult>;
}
