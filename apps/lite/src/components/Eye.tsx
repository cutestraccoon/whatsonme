export function Eye({ size = 26, color = '#FF7A1A' }: { size?: number; color?: string }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
}
export const cap = (s: string) => s === 'x' ? 'X' : s === 'tiktok' ? 'TikTok' : s === 'youtube' ? 'YouTube' : s.charAt(0).toUpperCase() + s.slice(1);
export const PLATFORM: Record<string, string> = { instagram: '#FF7A1A', tiktok: '#4CC9F0', youtube: '#F5C451', spotify: '#3DDC97', apple: '#06080C', x: '#B47CFF', snapchat: '#F5C451', browser: '#4CC9F0', steam: '#B47CFF', discord: '#7289DA', google: '#F5C451', uber: '#06080C', health: '#FF5C8A' };
export const MOODC: Record<string, string> = { Learn: '#4CC9F0', Aspire: '#FF7A1A', Comfort: '#C6F432', Doom: '#B47CFF', Funny: '#F5C451', Social: '#FF5C8A', Neutral: '#E4DFD3' };
export const pad = (n: number) => String(n).padStart(2, '0');
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function rgba(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`; }
