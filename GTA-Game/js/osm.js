// Real-world maps: download OpenStreetMap data for an area (free, © OpenStreetMap contributors)
// and turn it into a playable 3D city with real roads, buildings, parks, water and street names.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as W from './world.js';
import * as TX from './textures.js';

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/* ------------------------------------------------------------------ search */
export async function geocode(q) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error('Search failed (' + r.status + ')');
  return (await r.json()).map((p) => ({ name: p.display_name, lat: +p.lat, lon: +p.lon }));
}
export async function reverseName(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lon}`, { headers: { 'Accept-Language': 'en' } });
    const j = await r.json(), a = j.address || {};
    return [a.suburb || a.neighbourhood || a.road, a.city || a.town || a.village].filter(Boolean).join(', ') || 'My location';
  } catch (_) { return 'My location'; }
}

/* ------------------------------------------------------------------ download */
function overpassQuery(lat, lon, R) {
  const a = (r) => `(around:${r},${lat},${lon})`;
  return `[out:json][timeout:90];(` +
    `way["highway"]${a(R + 80)};` +
    `way["building"]${a(R)};` +
    `way["leisure"~"^(park|garden|pitch|playground|stadium|nature_reserve)$"]${a(R)};` +
    `way["landuse"~"^(grass|recreation_ground|forest|meadow|village_green|cemetery)$"]${a(R)};` +
    `way["natural"~"^(water|beach|sand|wood|scrub|grassland|coastline)$"]${a(R + 600)};` +
    `way["waterway"~"^(river|canal|riverbank|stream)$"]${a(R + 200)};` +
    `node["amenity"~"^(hospital|police)$"]${a(R)};` +
    `node["place"~"^(suburb|neighbourhood|quarter|locality|village|town|city)$"]${a(R + 3000)};` +
    `);out geom qt;`;
}

export async function fetchArea(lat, lon, R, status = () => {}) {
  const q = overpassQuery(lat.toFixed(5), lon.toFixed(5), R);
  let cache = null, lastErr = null;
  try { cache = await caches.open('kadal-osm-v1'); } catch (_) { /* Cache API unavailable */ }
  for (const ep of OVERPASS) {
    const url = ep + '?data=' + encodeURIComponent(q);
    try {
      if (cache) {
        const hit = await cache.match(url);
        if (hit) { status('Loading saved map…'); return await hit.json(); }
      }
      status('Downloading map data from OpenStreetMap… (first time can take 10–40 s)');
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 110000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tm);
      if (!res.ok) throw new Error('Map server replied ' + res.status);
      const txt = await res.text();
      const json = JSON.parse(txt);
      if (cache) { try { await cache.put(url, new Response(txt, { headers: { 'Content-Type': 'application/json' } })); } catch (_) { /* quota */ } }
      return json;
    } catch (e) { lastErr = e; status('Map server busy, trying another one…'); }
  }
  throw lastErr || new Error('Could not download the map');
}

/* ------------------------------------------------------------------ helpers */
const DRIVE = {
  motorway: 16, trunk: 14, primary: 13, secondary: 11, tertiary: 9, unclassified: 7, residential: 7,
  living_street: 6, service: 5, road: 7, motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 7, tertiary_link: 7,
};
const FOOT = { footway: 2.4, path: 2, pedestrian: 5, cycleway: 2.2, steps: 2, track: 3 };
const hashId = (id) => { let h = id % 2147483647; h = (h * 16807) % 2147483647; return h; };
function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.z - q.x * p[i].z; } return a / 2; }
function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q.x; z += q.z; } return { x: x / p.length, z: z / p.length }; }
function inside(p, x, z) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i].z > z) !== (p[j].z > z) && x < ((p[j].x - p[i].x) * (z - p[i].z)) / (p[j].z - p[i].z) + p[i].x) c = !c;
  }
  return c;
}
function polyGeo(pts, y, uvScale) {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale);
  return g;
}
// Flat strip along a polyline (roads, paths, rivers, lane dashes). Pushes into position/uv arrays.
function ribbon(pts, w, y, P, U, uvScale) {
  const n = pts.length;
  if (n < 2) return;
  const L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], c = pts[i];
    let nx, nz;
    const p0 = i > 0 ? pts[i - 1] : c, p1 = i < n - 1 ? pts[i + 1] : c;
    const d0x = c.x - p0.x, d0z = c.z - p0.z, d1x = p1.x - c.x, d1z = p1.z - c.z;
    const l0 = Math.hypot(d0x, d0z) || 1, l1 = Math.hypot(d1x, d1z) || 1;
    const n0x = i > 0 ? -d0z / l0 : -d1z / l1, n0z = i > 0 ? d0x / l0 : d1x / l1;
    const n1x = i < n - 1 ? -d1z / l1 : n0x, n1z = i < n - 1 ? d1x / l1 : n0z;
    nx = n0x + n1x; nz = n0z + n1z;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const sc = Math.min(3, 1 / Math.max(0.35, nx * n0x + nz * n0z));
    void a; void b;
    L.push([c.x + nx * w / 2 * sc, c.z + nz * w / 2 * sc]);
    Rr.push([c.x - nx * w / 2 * sc, c.z - nz * w / 2 * sc]);
  }
  for (let i = 0; i < n - 1; i++) {
    const q = [L[i], Rr[i], Rr[i + 1], L[i], Rr[i + 1], L[i + 1]];
    for (const v of q) { P.push(v[0], y, v[1]); U.push(v[0] / uvScale, v[1] / uvScale); }
  }
}
function disc(x, z, r, y, P, U, uvScale, seg = 12) {
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const v = [[x, z], [x + Math.cos(a0) * r, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, z + Math.sin(a1) * r]];
    for (const q of v) { P.push(q[0], y, q[1]); U.push(q[0] / uvScale, q[1] / uvScale); }
  }
}
function flatGeo(P, U) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const N = new Float32Array(P.length); for (let i = 1; i < N.length; i += 3) N[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}
function lengthOf(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return l; }
function offsetLine(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
    const dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1;
    out.push({ x: pts[i].x - (dz / l) * d, z: pts[i].z + (dx / l) * d });
  }
  return out;
}

/* ------------------------------------------------------------------ build */
export function buildOSMWorld(scene, data, place, low) {
  const { lat, lon, name, radius: R } = place;
  const kx = Math.cos((lat * Math.PI) / 180) * 111320, kz = 110540;
  const P = (g) => ({ x: (g.lon - lon) * kx, z: -(g.lat - lat) * kz });
  const out = { kind: 'osm', name, spots: {}, parked: [], policeParked: [], coinSpots: [], heartSpots: [], footprints: [] };
  Object.assign(W.BOUNDS, { minX: -R, maxX: R, minZ: -R, maxZ: R });
  const rnd = W.mulberry32(Math.round(lat * 1000 + lon * 7));

  const texRepeat = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
  const T = {
    asphalt: TX.asphalt(), pavers: TX.pavers(), grass: TX.grass(), sand: TX.sand(), concrete: TX.concrete(),
    water: TX.waterNormal(), facade: TX.facade(), glow: TX.glow(),
  };

  /* ---------- parse */
  const roads = [], foot = [], buildings = [], greens = [], waters = [], sands = [], rivers = [], coast = [], places = [], pois = [];
  for (const el of data.elements || []) {
    const t = el.tags || {};
    const nm = t['name:en'] || t.name;
    if (el.type === 'node') {
      if (t.place && nm) places.push({ name: nm, ...P(el) });
      else if (t.amenity === 'hospital' || t.amenity === 'police') pois.push({ kind: t.amenity, ...P(el) });
      continue;
    }
    if (el.type !== 'way' || !el.geometry) continue;
    const pts = el.geometry.filter(Boolean).map(P);
    if (pts.length < 2) continue;
    if (t.highway) {
      if (t.area === 'yes') continue;
      if (DRIVE[t.highway] !== undefined) {
        let w = DRIVE[t.highway];
        const lanes = parseFloat(t.lanes); if (lanes) w = Math.max(w, Math.min(lanes, 8) * 3.2);
        const graph = !(t.highway === 'service' && /driveway|parking_aisle|drive-through/.test(t.service || ''));
        roads.push({ pts, ids: el.nodes, w, name: nm, graph });
      } else if (FOOT[t.highway] !== undefined) foot.push({ pts, w: FOOT[t.highway] });
      continue;
    }
    if (t.building) {
      buildings.push({ pts, t, id: el.id });
      if (t.amenity === 'hospital' || t.amenity === 'police') pois.push({ kind: t.amenity, ...centroid(pts) });
    } else if (t.natural === 'coastline') coast.push(pts);
    else if (t.natural === 'water' || t.waterway === 'riverbank') waters.push(pts);
    else if (t.waterway) rivers.push({ pts, w: t.waterway === 'river' ? 24 : t.waterway === 'canal' ? 12 : 4 });
    else if (t.natural === 'beach' || t.natural === 'sand') sands.push(pts);
    else greens.push(pts);
    if (!t.building && (t.amenity === 'hospital' || t.amenity === 'police')) pois.push({ kind: t.amenity, ...centroid(pts) });
  }

  /* ---------- road graph (largest connected part inside the play area) */
  const nodes = new Map();
  const nkey = (r, i) => (r.ids && r.ids[i] !== undefined ? 'n' + r.ids[i] : `c${Math.round(r.pts[i].x * 2)},${Math.round(r.pts[i].z * 2)}`);
  const inPlay = (p) => Math.abs(p.x) < R - 10 && Math.abs(p.z) < R - 10;
  for (const r of roads) {
    if (!r.graph) continue;
    let prev = null;
    for (let i = 0; i < r.pts.length; i++) {
      const p = r.pts[i];
      if (!inPlay(p)) { prev = null; continue; }
      const k = nkey(r, i);
      let n = nodes.get(k);
      if (!n) nodes.set(k, (n = { x: p.x, z: p.z, adj: new Map() }));
      if (prev && prev !== n) {
        prev.adj.set(n, Math.max(prev.adj.get(n) || 0, r.w));
        n.adj.set(prev, Math.max(n.adj.get(prev) || 0, r.w));
      }
      prev = n;
    }
  }
  let best = [];
  const seen = new Set();
  for (const n of nodes.values()) {
    if (seen.has(n) || !n.adj.size) continue;
    const comp = [n]; seen.add(n);
    for (let i = 0; i < comp.length; i++) for (const m of comp[i].adj.keys()) if (!seen.has(m)) { seen.add(m); comp.push(m); }
    if (comp.length > best.length) best = comp;
  }
  if (best.length < 8) throw new Error('No drivable roads found in this area. Try a different place.');
  for (const n of best) n.id = W.addNode(n.x, n.z);
  for (const n of best) for (const [m, w] of n.adj) if (m.id !== undefined) W.addEdge(n.id, m.id, w);
  W.indexGraph();
  const G = W.GRAPH;

  /* ---------- ground */
  const groundMat = new THREE.MeshStandardMaterial({ map: texRepeat(T.concrete, 600, 600), color: 0xc2b494, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);

  const grassMat = new THREE.MeshStandardMaterial({ map: texRepeat(T.grass.map, 1, 1), normalMap: texRepeat(T.grass.normal, 1, 1), roughness: 0.95, side: THREE.DoubleSide });
  const sandMat = new THREE.MeshStandardMaterial({ map: T.sand.map, normalMap: T.sand.normal, roughness: 1, side: THREE.DoubleSide });
  const waterNormal = texRepeat(T.water, 1, 1);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0e5d7c, roughness: 0.06, metalness: 0.25, normalMap: waterNormal, normalScale: new THREE.Vector2(0.5, 0.5), side: THREE.DoubleSide });
  const addMerged = (geos, mat, receive = true) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos), mat); m.receiveShadow = receive; scene.add(m);
  };
  const safePoly = (pts, y, s) => { try { const p = pts.length > 2 && pts[0].x === pts[pts.length - 1].x && pts[0].z === pts[pts.length - 1].z ? pts.slice(0, -1) : pts; return p.length >= 3 ? polyGeo(p, y, s) : null; } catch (_) { return null; } };
  addMerged(greens.map((p) => safePoly(p, 0.004, 8)).filter(Boolean), grassMat);
  addMerged(sands.map((p) => safePoly(p, 0.003, 8)).filter(Boolean), sandMat);
  addMerged(waters.map((p) => safePoly(p, 0.007, 30)).filter(Boolean), waterMat, false);
  if (rivers.length) {
    const Pp = [], Uu = [];
    for (const r of rivers) ribbon(r.pts, r.w, 0.006, Pp, Uu, 30);
    const m = new THREE.Mesh(flatGeo(Pp, Uu), waterMat); scene.add(m);
  }

  /* ---------- sea from coastline (OSM: land is on the left of a coastline way) */
  const seaCells = [];
  if (coast.length) {
    const segs = [], SB = 100, sgrid = new Map(), sk = (a, b) => a * 100000 + b;
    for (const line of coast) for (let i = 0; i < line.length - 1; i++) {
      const s = { ax: line[i].x, az: line[i].z, bx: line[i + 1].x, bz: line[i + 1].z };
      segs.push(s);
      const cx = Math.floor((s.ax + s.bx) / 2 / SB), cz = Math.floor((s.az + s.bz) / 2 / SB);
      if (!sgrid.has(sk(cx, cz))) sgrid.set(sk(cx, cz), []);
      sgrid.get(sk(cx, cz)).push(s);
      if (Math.abs(s.ax) < R + 50 && Math.abs(s.az) < R + 50) W.addSegment(s.ax, s.az, s.bx, s.bz, 0.4);
    }
    const E = R + 350, C = 8;
    const Pp = [], Uu = [];
    for (let z = -E; z < E; z += C) {
      let runStart = null;
      for (let x = -E; x <= E; x += C) {
        let sea = false;
        if (x < E) {
          const px = x + C / 2, pz = z + C / 2, cx = Math.floor(px / SB), cz = Math.floor(pz / SB);
          let bd = Infinity, bs = null;
          for (let r = 0; r < 12; r++) {
            for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) {
              if (Math.max(Math.abs(a - cx), Math.abs(b - cz)) !== r) continue;
              const arr = sgrid.get(sk(a, b)); if (!arr) continue;
              for (const s of arr) {
                const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1e-9;
                const t = W.clamp(((px - s.ax) * dx + (pz - s.az) * dz) / L2, 0, 1);
                const d = (s.ax + dx * t - px) ** 2 + (s.az + dz * t - pz) ** 2;
                if (d < bd) { bd = d; bs = s; }
              }
            }
            if (bs && r >= 1) break;
          }
          if (bs) sea = (bs.bx - bs.ax) * (pz - bs.az) - (bs.bz - bs.az) * (px - bs.ax) > 0;
        }
        if (sea && runStart === null) runStart = x;
        if (!sea && runStart !== null) {
          const x0 = runStart, x1 = x, z0 = z, z1 = z + C;
          for (const v of [[x0, z0], [x1, z0], [x1, z1], [x0, z0], [x1, z1], [x0, z1]]) { Pp.push(v[0], 0.008, v[1]); Uu.push(v[0] / 30, v[1] / 30); }
          seaCells.push([x0, z0, x1 - x0, C]);
          runStart = null;
        }
      }
    }
    if (Pp.length) scene.add(new THREE.Mesh(flatGeo(Pp, Uu), waterMat));
  }

  /* ---------- roads, markings, footpaths */
  const roadMat = new THREE.MeshStandardMaterial({ map: T.asphalt.map, normalMap: T.asphalt.normal, roughness: 0.92, side: THREE.DoubleSide });
  const paveMat = new THREE.MeshStandardMaterial({ map: T.pavers.map, roughness: 0.9, side: THREE.DoubleSide });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  {
    const Pr = [], Ur = [], Pl = [], Ul = [], Pf = [], Uf = [];
    for (const r of roads) {
      const y = 0.012 + r.w * 0.0006;
      ribbon(r.pts, r.w, y, Pr, Ur, 7);
      disc(r.pts[0].x, r.pts[0].z, r.w / 2, y, Pr, Ur, 7);
      disc(r.pts[r.pts.length - 1].x, r.pts[r.pts.length - 1].z, r.w / 2, y, Pr, Ur, 7);
      for (let i = 1; i < r.pts.length - 1; i++) disc(r.pts[i].x, r.pts[i].z, r.w / 2, y, Pr, Ur, 7, 8);
      if (r.w >= 9) {
        // dashed centre line
        let carry = 0;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const a = r.pts[i], b = r.pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
          for (let s = carry; s < len; s += 6) {
            const e = Math.min(len, s + 3);
            if (e - s < 0.5) continue;
            const t0 = s / len, t1 = e / len;
            ribbon([{ x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 }, { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 }], 0.18, y + 0.006, Pl, Ul, 1);
          }
          carry = (carry + 6 - (len % 6)) % 6;
        }
      }
    }
    for (const f of foot) ribbon(f.pts, f.w, 0.01, Pf, Uf, 2);
    const add = (P2, U2, mat) => { if (!P2.length) return; const m = new THREE.Mesh(flatGeo(P2, U2), mat); m.receiveShadow = true; scene.add(m); };
    add(Pr, Ur, roadMat); add(Pl, Ul, lineMat); add(Pf, Uf, paveMat);
  }

  /* ---------- buildings */
  const facadeMats = new Map(), facadeData = new Map();
  const roofP = [], roofU = [], detail = [];
  const getFacade = (color, v) => {
    const k = color + '|' + v;
    if (!facadeMats.has(k)) {
      facadeMats.set(k, new THREE.MeshStandardMaterial({
        color, map: T.facade.map, roughnessMap: T.facade.rough, metalnessMap: T.facade.rough, roughness: 1, metalness: 0.55,
        normalMap: T.facade.normal, normalScale: new THREE.Vector2(0.9, 0.9), emissive: 0xffe0b0, emissiveMap: T.facade.ems[v], emissiveIntensity: 0,
      }));
      facadeData.set(k, { P: [], N: [], U: [] });
    }
    return facadeData.get(k);
  };
  const blds = buildings
    .map((b) => {
      let p = b.pts;
      if (p.length > 3 && Math.abs(p[0].x - p[p.length - 1].x) < 0.01 && Math.abs(p[0].z - p[p.length - 1].z) < 0.01) p = p.slice(0, -1);
      return { ...b, pts: p, c: centroid(p) };
    })
    .filter((b) => b.pts.length >= 3 && Math.abs(b.c.x) < R + 30 && Math.abs(b.c.z) < R + 30)
    .sort((a, b) => Math.hypot(a.c.x, a.c.z) - Math.hypot(b.c.x, b.c.z))
    .slice(0, low ? 3500 : 8000);
  for (const b of blds) {
    const p = b.pts, A = signedArea(p);
    if (Math.abs(A) < 10) continue;
    const t = b.t, r = W.mulberry32(b.id % 100000 + 7);
    const hTag = parseFloat(t.height), lv = parseFloat(t['building:levels']);
    let floors;
    if (hTag) floors = hTag / 3.5;
    else if (lv) floors = lv;
    else {
      const ty = t.building, big = Math.abs(A) > 400;
      floors = ty === 'apartments' ? 4 + r() * 6 : /commercial|office|retail|hotel/.test(ty) ? 3 + r() * 5
        : /house|detached|terrace|residential|semidetached/.test(ty) ? 1 + r() * 2.5 : /hut|shed|garage|roof|kiosk/.test(ty) ? 1
          : /industrial|warehouse/.test(ty) ? 2 : /temple|church|mosque|religious/.test(ty) ? 2 + r() * 2 : /hospital|school|university|college/.test(ty) ? 3 + r() * 3
            : big ? 2 + r() * 5 : 1 + r() * 3;
    }
    floors = W.clamp(Math.round(floors), 1, 45);
    const h = floors * 3.5;
    const color = W.PALETTE[hashId(b.id) % W.PALETTE.length];
    const F = getFacade(color, hashId(b.id) % 2);
    const outwardLeft = A < 0;
    let cum = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const nx = outwardLeft ? -dz / len : dz / len, nz = outwardLeft ? dx / len : -dx / len;
      const u0 = cum / 9, u1 = (cum + len) / 9, v1 = floors / 2;
      const a0 = [a.x, 0, a.z, u0, 0], b0 = [c.x, 0, c.z, u1, 0], b1 = [c.x, h, c.z, u1, v1], a1 = [a.x, h, a.z, u0, v1];
      const tris = outwardLeft ? [a0, b0, b1, a0, b1, a1] : [a0, b1, b0, a0, a1, b1];
      for (const v of tris) { F.P.push(v[0], v[1], v[2]); F.N.push(nx, 0, nz); F.U.push(v[3], v[4]); }
      cum += len;
      W.addSegment(a.x, a.z, c.x, c.z, h);
    }
    try {
      const tri = THREE.ShapeUtils.triangulateShape(p.map((q) => new THREE.Vector2(q.x, q.z)), []);
      for (const f of tri) for (const idx of f) { roofP.push(p[idx].x, h + 0.02, p[idx].z); roofU.push(p[idx].x / 6, p[idx].z / 6); }
    } catch (_) { /* bad polygon: skip roof */ }
    out.footprints.push(p);
    if (Math.abs(A) > 80 && r() < 0.35) {
      const g = W.colorize(new THREE.CylinderGeometry(0.75, 0.8, 1.5, 10), 0x1c1c1c);
      g.translate(b.c.x, h + 0.75, b.c.z); detail.push(g);
    }
  }
  for (const [k, d] of facadeData) {
    if (!d.P.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(d.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.U, 2));
    const m = new THREE.Mesh(g, facadeMats.get(k)); m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  if (roofP.length) {
    const m = new THREE.Mesh(flatGeo(roofP, roofU), new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.95, side: THREE.DoubleSide }));
    m.receiveShadow = true; scene.add(m);
  }

  /* ---------- street lamps, trees, walking paths */
  const lamps = [], trees = [], palms = [], paths = [];
  for (const r of roads) {
    const len = lengthOf(r.pts);
    if (r.w >= 7 && len > 20) {
      let side = 1, acc = 15;
      for (let i = 0; i < r.pts.length - 1 && lamps.length < (low ? 400 : 1100); i++) {
        const a = r.pts[i], b = r.pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
        const nx = -(b.z - a.z) / (l || 1), nz = (b.x - a.x) / (l || 1);
        while (acc < l) {
          const t = acc / l, x = a.x + (b.x - a.x) * t + nx * side * (r.w / 2 + 0.8), z = a.z + (b.z - a.z) * t + nz * side * (r.w / 2 + 0.8);
          if (Math.abs(x) < R && Math.abs(z) < R) {
            lamps.push([x, 0, z, 1, Math.atan2(-nx * side, -nz * side)]);
            if (r.w >= 9 && rnd() < 0.5) {
              const tx = x + (b.x - a.x) / (l || 1) * 9, tz = z + (b.z - a.z) / (l || 1) * 9;
              (rnd() < 0.3 ? palms : trees).push([tx + nx * side * 1.2, 0, tz + nz * side * 1.2, 0.5 + rnd() * 0.3, rnd() * 6]);
            }
          }
          acc += 32; side = -side;
        }
        acc -= l;
      }
    }
    if (r.w >= 6 && len > 25 && paths.length < 2000) {
      for (const s of [-1, 1]) {
        const off = offsetLine(r.pts, s * (r.w / 2 + 1.4)).filter((q) => Math.abs(q.x) < R && Math.abs(q.z) < R);
        if (off.length >= 2 && lengthOf(off) > 20) paths.push(W.makePath(off, false));
      }
    }
  }
  for (const g of greens) {
    const p = g.length > 3 ? g.slice(0, -1) : g;
    const A = Math.abs(signedArea(p));
    if (A < 120) continue;
    const c = centroid(p);
    if (Math.abs(c.x) > R + 50 || Math.abs(c.z) > R + 50) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const q of p) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z); }
    const want = Math.min(40, A / 160);
    for (let k = 0, placed = 0; k < want * 4 && placed < want && trees.length < 1500; k++) {
      const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
      if (!inside(p, x, z)) continue;
      (rnd() < 0.25 ? palms : trees).push([x, 0, z, 0.8 + rnd() * 0.5, rnd() * 6]); placed++;
    }
  }
  for (const t of trees.concat(palms)) W.addCollider(t[0] - 0.4, t[2] - 0.4, t[0] + 0.4, t[2] + 0.4, 6);
  if (!paths.length) paths.push(W.makePath([{ x: -20, z: 0 }, { x: 20, z: 0 }], false));

  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const instanced = (geo, mat, list, shadow = false, receive = true) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, k) => { pv.set(it[0], it[1], it[2]); e.set(0, it[4] || 0, 0); q.setFromEuler(e); sv.setScalar(it[3] || 1); m4.compose(pv, q, sv); im.setMatrixAt(k, m4); });
    im.castShadow = shadow; im.receiveShadow = receive; im.frustumCulled = false; scene.add(im); return im;
  };
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  instanced(W.lampGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 }), lamps, !low);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const bulbGeo = new THREE.BoxGeometry(0.26, 0.04, 0.5); bulbGeo.translate(0, 6.9, 2.0);
  instanced(bulbGeo, lampMat, lamps);
  const poolGeo = new THREE.PlaneGeometry(8, 8); poolGeo.rotateX(-Math.PI / 2); poolGeo.translate(0, 0.08, 2.6);
  const poolMat = new THREE.MeshBasicMaterial({ map: T.glow, color: 0xffc77a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  instanced(poolGeo, poolMat, lamps, false, false);
  instanced(W.palmGeometry(), vc, palms, !low);
  instanced(W.treeGeometry(7), vc, trees, !low);
  if (detail.length) scene.add(new THREE.Mesh(W.mergeAll(detail), vc));

  /* ---------- gameplay spots */
  const ids = [];
  for (let i = 0; i < G.x.length; i++) if (G.adj[i].length) ids.push(i);
  const dist = (a, x, z) => Math.hypot(G.x[a] - x, G.z[a] - z);
  const widest = (a) => Math.max(...G.adj[a].map((b) => W.edgeWidth(a, b)));
  function spotAt(a) {
    let b = G.adj[a][0];
    for (const n of G.adj[a]) if (Math.hypot(G.x[n] - G.x[a], G.z[n] - G.z[a]) > Math.hypot(G.x[b] - G.x[a], G.z[b] - G.z[a])) b = n;
    const dx = G.x[b] - G.x[a], dz = G.z[b] - G.z[a], len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    const lx = uz, lz = -ux, w = W.edgeWidth(a, b), along = Math.min(len * 0.5, 6);
    const park = W.curbSpot(a, b, Math.min(0.8, (along + 5) / len));
    return {
      x: G.x[a] + ux * along + lx * (w / 2 + 1.6), z: G.z[a] + uz * along + lz * (w / 2 + 1.6),
      face: Math.atan2(-lx, -lz), heading: Math.atan2(dx, dz), park: { x: park.x, z: park.z, heading: park.heading }, node: a,
    };
  }
  const byCentre = ids.slice().sort((a, b) => dist(a, 0, 0) - dist(b, 0, 0));
  const spawnNode = byCentre.find((a) => widest(a) >= 7 && G.adj[a].length >= 2) ?? byCentre[0];
  out.spots.spawn = spotAt(spawnNode);
  const poiSpot = (kind, fallbackDist) => {
    const list = pois.filter((p) => p.kind === kind && Math.abs(p.x) < R && Math.abs(p.z) < R).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    if (list.length) return spotAt(W.nearestNode(list[0].x, list[0].z));
    const n = byCentre.find((a) => dist(a, 0, 0) > fallbackDist) ?? byCentre[byCentre.length - 1];
    return spotAt(n);
  };
  out.spots.police = poiSpot('police', 220);
  out.spots.hospital = poiSpot('hospital', 300);
  {
    const a = out.spots.police.node, b = G.adj[a][0];
    out.policeParked.push(W.curbSpot(a, b, 0.25), W.curbSpot(b, a, 0.25));
  }
  for (let k = 0, tries = 0; k < 40 && tries < 400; tries++) {
    const [a, b] = W.randomEdge();
    if (W.edgeWidth(a, b) < 6 || Math.hypot(G.x[b] - G.x[a], G.z[b] - G.z[a]) < 12) continue;
    const s = W.curbSpot(a, b, 0.5);
    if (out.parked.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 10)) continue;
    out.parked.push(s); k++;
  }
  const near = paths.filter((p) => Math.hypot(p.cx, p.cz) < R * 0.8);
  for (let k = 0; k < 34; k++) {
    const p = near.length ? near[(rnd() * near.length) | 0] : paths[0];
    (k < 28 ? out.coinSpots : out.heartSpots).push(W.pathPoint(p, rnd() * p.P));
  }
  out.pathNear = (ref, rad = 200) => {
    const cand = paths.filter((p) => Math.abs(p.cx - ref.x) < rad && Math.abs(p.cz - ref.z) < rad);
    const list = cand.length ? cand : paths;
    return list[(Math.random() * list.length) | 0];
  };

  /* ---------- mission placement on the real road network */
  out.missionLayout = (defs) => {
    const used = [{ x: out.spots.spawn.x, z: out.spots.spawn.z }];
    const pool = ids.filter((a) => Math.abs(G.x[a]) < R * 0.85 && Math.abs(G.z[a]) < R * 0.85 && G.adj[a].length >= 2);
    const pickSite = () => {
      for (let t = 0; t < 400; t++) {
        const a = pool[(rnd() * pool.length) | 0];
        if (used.some((u) => Math.hypot(u.x - G.x[a], u.z - G.z[a]) < 110 - t * 0.2)) continue;
        used.push({ x: G.x[a], z: G.z[a] }); return a;
      }
      return pool[(rnd() * pool.length) | 0] ?? spawnNode;
    };
    const chain = (start, k, minD, maxD) => {
      const pts = []; let cur = start;
      for (let i = 0; i < k; i++) {
        let next = null;
        for (let t = 0; t < 300 && next === null; t++) {
          const a = ids[(rnd() * ids.length) | 0], d = Math.hypot(G.x[a] - G.x[cur], G.z[a] - G.z[cur]);
          if (d >= minD && d <= maxD && Math.abs(G.x[a]) < R * 0.9 && Math.abs(G.z[a]) < R * 0.9) next = a;
        }
        if (next === null) next = ids[(rnd() * ids.length) | 0];
        pts.push({ x: G.x[next], z: G.z[next] }); cur = next;
      }
      return pts;
    };
    const L = {};
    for (const d of defs) {
      const a = pickSite(), spot = spotAt(a);
      if (d.type === 'cp') {
        const k = d.nodes ? d.nodes.length : d.points ? d.points.length : 4;
        L[d.id] = { spot, points: d.onFoot ? chain(a, k, 35, 80) : chain(a, k, 140, 300) };
      } else if (d.type === 'wreck') L[d.id] = { spot, route: [a, G.adj[a][0]] };
      else L[d.id] = { spot };
    }
    return L;
  };

  /* ---------- area / street names */
  const named = new Map(), NB = 40, nk = (a, b) => a * 100000 + b;
  for (const r of roads) {
    if (!r.name) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], k = nk(Math.floor((a.x + b.x) / 2 / NB), Math.floor((a.z + b.z) / 2 / NB));
      if (!named.has(k)) named.set(k, []);
      named.get(k).push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, name: r.name, w: r.w });
    }
  }
  const placeName = (x, z) => {
    let bn = name.split(',')[0], bd = Infinity;
    for (const p of places) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; bn = p.name; } }
    return bn;
  };
  W.setWorldFns(() => 0, (x, z) => {
    const cx = Math.floor(x / NB), cz = Math.floor(z / NB);
    let road = null, bd = Infinity;
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
      for (const s of named.get(nk(a, b)) || []) {
        const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1e-9;
        const t = W.clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1);
        const d = Math.hypot(s.ax + dx * t - x, s.az + dz * t - z);
        if (d < s.w / 2 + 6 && d < bd) { bd = d; road = s.name; }
      }
    }
    const area = placeName(x, z);
    return road ? `${road} · ${area}` : area;
  });

  /* ---------- minimap image */
  const ext = R + 60, S = Math.ceil(ext * 2);
  const mc = document.createElement('canvas'); mc.width = S; mc.height = S;
  const g = mc.getContext('2d'), X = (x) => x + ext, Z = (z) => z + ext;
  g.fillStyle = '#a99f84'; g.fillRect(0, 0, S, S);
  const fillPoly = (p, col) => { g.fillStyle = col; g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z)))); g.closePath(); g.fill(); };
  for (const c of seaCells) { g.fillStyle = '#2a86ad'; g.fillRect(X(c[0]), Z(c[1]), c[2] + 0.5, c[3] + 0.5); }
  for (const p of sands) fillPoly(p, '#e3cc8f');
  for (const p of greens) fillPoly(p, '#6fa04a');
  for (const p of waters) fillPoly(p, '#2a86ad');
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of rivers) { g.strokeStyle = '#2a86ad'; g.lineWidth = r.w; g.beginPath(); r.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z)))); g.stroke(); }
  for (const p of out.footprints) fillPoly(p, '#d9d3c7');
  for (const f of foot) { g.strokeStyle = '#c9bea6'; g.lineWidth = 1.5; g.beginPath(); f.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z)))); g.stroke(); }
  for (const r of roads.slice().sort((a, b) => a.w - b.w)) {
    g.strokeStyle = r.w >= 11 ? '#2b2d33' : '#3e4048'; g.lineWidth = r.w;
    g.beginPath(); r.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z)))); g.stroke();
  }
  out.map = { canvas: mc, minX: -ext, minZ: -ext };

  const facadeList = [...facadeMats.values()];
  out.update = (dt, night, t) => {
    for (let k = 0; k < facadeList.length; k++) facadeList[k].emissiveIntensity = night * 1.1;
    lampMat.emissiveIntensity = night * 4;
    poolMat.opacity = night * 0.5;
    waterNormal.offset.x = t * 0.004; waterNormal.offset.y = t * 0.002;
  };
  return out;
}
