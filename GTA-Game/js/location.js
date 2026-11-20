// Location picker on the start/pause menu: real places (OpenStreetMap) or the fictional city.
import { geocode, reverseName } from './osm.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const panel = $('loc-panel'), err = $('loc-err'), results = $('loc-results');
const CHOSEN = 'kadal-loc-chosen';
const remember = () => { try { localStorage.setItem(CHOSEN, '1'); } catch (_) { /* ignore */ } };
const chosenBefore = () => { try { return localStorage.getItem(CHOSEN) === '1'; } catch (_) { return false; } };

$('loc-name').textContent = params.get('place') ? params.get('name') || 'Real place' : 'Kadal Nagaram (fictional city)';
if (params.get('r')) $('loc-size').value = params.get('r');

function showErr(text) { err.textContent = text; err.classList.remove('hidden'); }
if (params.get('maperr')) {
  panel.classList.remove('hidden');
  showErr(`Couldn't load that map: ${params.get('maperr')}. The free map servers may be busy, so try again in a minute or pick another place.`);
} else if (!params.get('place') && !chosenBefore()) panel.classList.remove('hidden');

$('loc-change').addEventListener('click', () => panel.classList.toggle('hidden'));

function go(lat, lon, name) {
  remember();
  const r = $('loc-size').value;
  location.href = `?place=${(+lat).toFixed(5)},${(+lon).toFixed(5)}&name=${encodeURIComponent(name)}&r=${r}`;
}
document.querySelectorAll('.loc-presets button').forEach((b) =>
  b.addEventListener('click', () => go(b.dataset.lat, b.dataset.lon, b.dataset.name)));

$('loc-fict').addEventListener('click', () => { remember(); location.href = location.pathname; });

$('loc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('loc-q').value.trim();
  if (!q) return;
  err.classList.add('hidden');
  results.textContent = 'Searching…';
  try {
    const list = await geocode(q);
    results.textContent = '';
    if (!list.length) { results.textContent = 'No places found. Try adding the city name.'; return; }
    for (const p of list) {
      const b = document.createElement('button');
      b.className = 'loc-result';
      b.textContent = p.name;
      b.addEventListener('click', () => go(p.lat, p.lon, p.name.split(',').slice(0, 3).join(',')));
      results.appendChild(b);
    }
  } catch (ex) {
    results.textContent = '';
    showErr('Search failed. Check your internet connection and try again.');
  }
});

$('loc-gps').addEventListener('click', () => {
  if (!navigator.geolocation) { showErr('Your browser does not support location.'); return; }
  results.textContent = 'Finding your location…';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const name = await reverseName(latitude, longitude);
      go(latitude, longitude, name);
    },
    () => { results.textContent = ''; showErr('Location permission was denied or unavailable.'); },
    { timeout: 15000 },
  );
});
