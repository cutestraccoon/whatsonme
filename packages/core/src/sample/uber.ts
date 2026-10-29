import type { MapArchive } from '../util/archive.js';
import { archive, randomTs, rng, sqlTs } from './_rng.js';

const uberTs = (ms: number) => sqlTs(ms) + ' +0000 UTC';
const csv = (head: string[], rows: (string | number)[][]) => [head.join(','), ...rows.map((r) => r.map((c) => { const s = String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','))].join('\n') + '\n';

const ADDR = ['1200 Don Mills Rd, North York, ON', '55 Bloor St W, Toronto, ON', '220 Yonge St, Toronto, ON', '1 Blue Jays Way, Toronto, ON', '6301 Silver Dart Dr, Mississauga, ON', '70 Richmond St W, London, ON'];
const REST = ['Pai Northern Thai', 'Paramount Fine Foods', 'Seven Lives Tacos', 'Burger\'s Priest', 'Sushi on Bloor', 'Mamakas'];

/** Uber "Download your data": Rider/trips_data.csv + Eats/eats_order_details.csv. */
export function makeUberArchive(): MapArchive {
  const r = rng(2024);
  const trips: (string | number)[][] = [];
  for (let i = 0; i < 70; i++) {
    const req = randomTs(r); const begin = req + r.int(2, 9) * 60000; const dur = r.int(8, 45) * 60000;
    const cancelled = r.chance(0.15);
    const status = cancelled ? r.pick(['CANCELED', 'RIDER_CANCELED', 'DRIVER_CANCELED']) : 'COMPLETED';
    const miles = cancelled ? 0 : +(r.next() * 12 + 1).toFixed(2);
    const lat = 43.6 + r.next() * 0.2, lng = -79.6 + r.next() * 0.3;
    trips.push([r.pick(['Toronto', 'Toronto', 'Toronto', 'London (ON)']), r.pick(['UberX', 'UberX', 'Comfort', 'UberXL']), status, uberTs(req), cancelled ? '' : uberTs(begin), cancelled ? '' : lat.toFixed(5), cancelled ? '' : lng.toFixed(5), cancelled ? '' : r.pick(ADDR),
      cancelled ? '' : uberTs(begin + dur), cancelled ? '' : (lat + 0.05).toFixed(5), cancelled ? '' : (lng + 0.04).toFixed(5), cancelled ? '' : r.pick(ADDR), miles, cancelled ? (r.chance(0.5) ? 5 : 0) : +(miles * 2.1 + 6).toFixed(2), 'CAD']);
  }
  const eats: (string | number)[][] = Array.from({ length: 35 }, () => [uberTs(randomTs(r)), r.pick(REST), +(r.next() * 40 + 15).toFixed(2), 'CAD', r.chance(0.1) ? 'canceled' : 'completed', '1200 Don Mills Rd, North York, ON', 'Toronto', r.pick(['Pad Thai x1, Spring Rolls x2', 'Chicken Shawarma Plate x1', 'Taco Trio x2'])]);
  return archive({
    'Uber Data/Rider/trips_data.csv': csv(['City', 'Product Type', 'Trip or Order Status', 'Request Time', 'Begin Trip Time', 'Begin Trip Lat', 'Begin Trip Lng', 'Begin Trip Address', 'Dropoff Time', 'Dropoff Lat', 'Dropoff Lng', 'Dropoff Address', 'Distance (miles)', 'Fare Amount', 'Fare Currency'], trips),
    'Uber Data/Rider/rider_app_analytics.csv': csv(['Event Time', 'Event Name'], [[uberTs(randomTs(r)), 'app_open']]),
    'Uber Data/Eats/eats_order_details.csv': csv(['Order Time', 'Restaurant Name', 'Order Price', 'Currency', 'Order Status', 'Delivery address', 'City', 'Item Name'], eats),
    'Uber Data/Rider/README.txt': 'Your Uber data',
  });
}
