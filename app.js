/* ============================================================
   SKYLAB — live Earth & sky
   Preview-matched build. All data is live:
     Open-Meteo   weather, models, air quality, UV
     NOAA / NWS   alerts
     NOAA SWPC    Kp, solar wind, IMF, GOES X-ray, sunspots, scales
     NASA DONKI   supplemental flare / CME context
     RainViewer   radar + satellite tiles
     Astronomy Engine   local Sun / Moon / planet / eclipse maths
     Celestrak + satellite.js   ISS passes (progressive enhancement)
   ============================================================ */

const $ = id => document.getElementById(id);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  lat: null, lon: null, name: '',
  weather: null, air: null, alerts: [],
  space: {},
  astro: { events: [], planets: [], moon: null, highlights: [] },
  models: null, modelTab: 'temperature',
  radar: { frames: [], idx: 0, playing: false, timer: null, layers: { radar: true, clouds: false, base: 0 } },
  page: 'now',
  updatedAt: null
};

/* ---------- constants ------------------------------------- */

const CODES = {
  0:'Clear', 1:'Mostly clear', 2:'Partly cloudy', 3:'Overcast',
  45:'Fog', 48:'Rime fog',
  51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
  56:'Freezing drizzle', 57:'Heavy freezing drizzle',
  61:'Light rain', 63:'Rain', 65:'Heavy rain',
  66:'Freezing rain', 67:'Heavy freezing rain',
  71:'Light snow', 73:'Snow', 75:'Heavy snow', 77:'Snow grains',
  80:'Rain showers', 81:'Rain showers', 82:'Heavy showers',
  85:'Snow showers', 86:'Heavy snow showers',
  95:'Thunderstorms', 96:'Thunderstorms + hail', 99:'Severe thunderstorms + hail'
};

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

/* meteor showers: [name, startMonth, startDay, endMonth, endDay, peakMonth, peakDay] (0-indexed months) */
const SHOWERS = [
  ['Quadrantids',      11,28, 0,12,  0, 3],
  ['Lyrids',            3,16, 3,25,  3,22],
  ['Eta Aquariids',     3,19, 4,28,  4, 6],
  ['Delta Aquariids',   6,12, 7,23,  6,30],
  ['Perseids',          6,17, 7,24,  7,12],
  ['Draconids',         9, 6, 9,10,  9, 8],
  ['Orionids',          9, 2,10, 7,  9,21],
  ['Leonids',          10, 6,10,30, 10,17],
  ['Geminids',         11, 4,11,20, 11,14],
  ['Ursids',           11,17,11,26, 11,22]
];

/* ---------- small helpers --------------------------------- */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v, d = 0) => Number.isFinite(+v) ? (+v).toFixed(d) : '—';
const miles = m => m / 1609.344;
const feet = m => m * 3.28084;
const round = v => Number.isFinite(+v) ? Math.round(+v) : null;

const timeFmt = x => {
  if (!x) return '—';
  const d = x instanceof Date ? x : new Date(x);
  if (isNaN(d)) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
};
const hourFmt = x => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(x));
const dayFmt = x => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(x));
const dateShort = x => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(x));

function agoFmt(d) {
  if (!d) return 'Live conditions';
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return 'Updated just now';
  if (mins === 1) return 'Updated 1m ago';
  if (mins < 60) return `Updated ${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `Updated ${h}h ago`;
}

const windDir = d => Number.isFinite(+d) ? COMPASS[Math.round(((+d % 360) + 360) % 360 / 22.5) % 16] : '—';

function setLoading(v) { $('loader').classList.toggle('active', v); }
function showError(msg = '') {
  const b = $('errorBanner');
  b.textContent = msg;
  b.classList.toggle('show', !!msg);
}

/* weather-code → sprite symbol id */
function codeIcon(code, isDay = 1) {
  const c = +code;
  if ([95, 96, 99].includes(c)) return 'i-storm';
  if ([61,63,65,80,81,82,51,53,55,56,57,66,67].includes(c)) return 'i-rain';
  if ([71,73,75,77,85,86].includes(c)) return 'i-snow';
  if ([45,48].includes(c)) return 'i-fog';
  if (c === 0) return isDay ? 'i-sun' : 'i-moon';
  if (c <= 2) return isDay ? 'i-cloud-sun' : 'i-moon';
  return 'i-cloud';
}
const svgIcon = (id, cls = '') => `<svg class="${cls}"><use href="#${id}"/></svg>`;

/* the crescent + sparkle mark used in the Now hero at night */
const HERO_NIGHT = `<svg viewBox="0 0 64 64" fill="none" stroke="#eef2f6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M47.8 38.6A19.4 19.4 0 0 1 25.4 16.2 19.4 19.4 0 1 0 47.8 38.6Z"/>
  <path d="M45.6 12.6v8.2M41.5 16.7h8.2" stroke-width="2.4"/></svg>`;
const HERO_DAY = `<svg viewBox="0 0 64 64" fill="none" stroke="#f3c04f" stroke-width="2.6" stroke-linecap="round">
  <circle cx="32" cy="32" r="11.4" fill="#f3c04f" stroke="none"/>
  <path d="M32 6.6v7.2M32 50.2v7.2M6.6 32h7.2M50.2 32h7.2M14.2 14.2l5.1 5.1M44.7 44.7l5.1 5.1M49.8 14.2l-5.1 5.1M19.3 44.7l-5.1 5.1"/></svg>`;

/* ============================================================
   Navigation
   ============================================================ */

const PAGES = {
  now:       { title: 'Now',              parent: 'now',      actions: ['location'] },
  tonight:   { title: 'Tonight',          parent: 'tonight',  actions: ['menu'] },
  weather:   { title: 'Weather',          parent: 'weather',  actions: ['refresh'] },
  space:     { title: 'Space Weather',    parent: 'space',    actions: ['menu'] },
  astronomy: { title: 'Astronomy',        parent: 'calendar', actions: ['share'], back: true },
  map:       { title: 'Map',              parent: 'weather',  actions: ['menu'],  back: true },
  models:    { title: 'Model Comparison', parent: 'weather',  actions: [],        back: true },
  calendar:  { title: 'Calendar',         parent: 'calendar', actions: ['menu'] }
};

function subtitleFor(page) {
  const n = state.name || 'your location';
  switch (page) {
    case 'now':       return state.weather ? agoFmt(state.updatedAt) : 'Live conditions';
    case 'space':     return state.space?.kp ? agoFmt(state.updatedAt) : 'Live near Earth';
    case 'map':       return 'Layers';
    case 'models':    return state.name || 'Model guidance';
    case 'calendar':  return new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ' ›';
    default:          return state.name ? `for ${n}` : 'Local sky & conditions';
  }
}

function syncHeader(page) {
  const cfg = PAGES[page] || PAGES.now;
  $('screenTitle').textContent = cfg.title;
  $('screenSubtitle').textContent = subtitleFor(page);
  $('backBtn').classList.toggle('hidden', !cfg.back);
  $('refreshBtn').classList.toggle('hidden', !cfg.actions.includes('refresh'));
  $('shareBtn').classList.toggle('hidden', !cfg.actions.includes('share'));
  $('locationBtn').classList.toggle('hidden', !cfg.actions.includes('location'));
  $('menuBtn').classList.toggle('hidden', !cfg.actions.includes('menu'));
}

function go(page) {
  if (!PAGES[page]) page = 'now';
  state.page = page;
  qa('.page').forEach(p => p.classList.toggle('active', p.dataset.page === page));
  const parent = PAGES[page].parent;
  qa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === parent));
  syncHeader(page);
  window.scrollTo(0, 0);

  if (page === 'map') setTimeout(initRadar, 60);
  if (page === 'models') loadModels();
  if (page === 'astronomy') renderAstronomy();
}

qa('[data-nav]').forEach(b => b.onclick = () => go(b.dataset.nav));
qa('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));

/* hash routing — deep-links and makes each screen addressable */
function pageFromHash() {
  const h = (location.hash || '').replace('#', '');
  return PAGES[h] ? h : null;
}
window.addEventListener('hashchange', () => {
  const p = pageFromHash();
  if (p && p !== state.page) go(p);
});
$('backBtn').onclick = () => go(PAGES[state.page]?.parent || 'now');
$('refreshBtn').onclick = () => { if (state.lat) refresh(); };

$('shareBtn').onclick = async () => {
  const text = `Tonight in ${state.name}: ${$('worthOutside').textContent} — sky score ${$('tSky').textContent}.`;
  try {
    if (navigator.share) await navigator.share({ title: 'SKYLAB', text });
    else await navigator.clipboard.writeText(text);
  } catch {}
};
$('menuBtn').onclick = () => $('locationModal').classList.add('open');

/* modals */
$('locationBtn').onclick = () => $('locationModal').classList.add('open');
qa('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.remove('open'));
qa('[data-open]').forEach(b => b.onclick = () => $(b.dataset.open).classList.add('open'));
qa('.modal').forEach(m => m.onclick = e => { if (e.target === m) m.classList.remove('open'); });
$('flareAll').onclick = () => { renderFlareModal(); $('flareModal').classList.add('open'); };

qa('.preset').forEach(b => b.onclick = () => {
  setLocation(+b.dataset.lat, +b.dataset.lon, b.dataset.name);
  $('locationModal').classList.remove('open');
});

$('useLocation').onclick = () => {
  if (!navigator.geolocation) return showError('Geolocation is unavailable in this browser.');
  navigator.geolocation.getCurrentPosition(
    p => { setLocation(p.coords.latitude, p.coords.longitude, 'Current location'); $('locationModal').classList.remove('open'); },
    () => showError('Location permission was not granted. Pick a preset and everything else still works.'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
};

/* ============================================================
   Data loading
   ============================================================ */

async function json(url, timeout = 12000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function setLocation(lat, lon, name) {
  Object.assign(state, { lat, lon, name });
  syncHeader(state.page);
  localStorage.setItem('skylab-location', JSON.stringify({ lat, lon, name }));
  showError();
  await refresh();
}

async function refresh() {
  setLoading(true);
  try {
    await Promise.allSettled([loadWeather(), loadAir(), loadAlerts(), loadSpace()]);
    state.updatedAt = Date.now();
    state.models = null;                    // force re-fetch with fresh location
    loadAstronomy();
    renderAll();
    /* a screen opened before the location resolved still needs its own data */
    if (state.page === 'models') loadModels(true);
    if (state.page === 'map') initRadar();
    loadIss().then(() => { renderAstronomy(); renderVisible(); }).catch(() => {});
  } finally {
    setLoading(false);
  }
}

async function loadWeather() {
  const hourly = ['temperature_2m','apparent_temperature','relative_humidity_2m','dew_point_2m',
    'precipitation_probability','precipitation','rain','snowfall','weather_code','cloud_cover',
    'cloud_cover_low','cloud_cover_mid','cloud_cover_high','visibility','pressure_msl',
    'wind_speed_10m','wind_direction_10m','wind_gusts_10m','cape','cloud_base',
    'freezing_level_height','shortwave_radiation','uv_index','is_day'].join(',');
  const daily = ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_probability_max',
    'sunrise','sunset','uv_index_max'].join(',');
  const current = ['temperature_2m','relative_humidity_2m','apparent_temperature','is_day','precipitation',
    'weather_code','cloud_cover','pressure_msl','wind_speed_10m','wind_direction_10m','wind_gusts_10m'].join(',');

  state.weather = await json(
    `https://api.open-meteo.com/v1/forecast?latitude=${state.lat}&longitude=${state.lon}` +
    `&current=${current}&hourly=${hourly}&daily=${daily}` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=10`
  );
  if (state.name === 'Current location') resolveName();
}

async function resolveName() {
  try {
    const d = await json(`https://api.weather.gov/points/${state.lat.toFixed(4)},${state.lon.toFixed(4)}`);
    const p = d.properties?.relativeLocation?.properties;
    if (p?.city) {
      state.name = `${p.city}, ${p.state}`;
      syncHeader(state.page);
      localStorage.setItem('skylab-location', JSON.stringify({ lat: state.lat, lon: state.lon, name: state.name }));
    }
  } catch {}
}

async function loadAir() {
  state.air = await json(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${state.lat}&longitude=${state.lon}` +
    `&current=us_aqi,pm2_5,uv_index&hourly=us_aqi,uv_index&timezone=auto&forecast_days=2`
  );
}

async function loadAlerts() {
  try {
    const a = await json(`https://api.weather.gov/alerts/active?point=${state.lat.toFixed(4)},${state.lon.toFixed(4)}`);
    state.alerts = a.features || [];
  } catch { state.alerts = []; }
}

async function loadSpace() {
  const endpoints = {
    kp:       'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    plasma:   'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json',
    mag:      'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json',
    xray:     'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json',
    scales:   'https://services.swpc.noaa.gov/products/noaa-scales.json',
    sunspots: 'https://services.swpc.noaa.gov/json/solar-cycle/sunspots.json'
  };
  const out = await Promise.allSettled(Object.entries(endpoints).map(async ([k, u]) => [k, await json(u)]));
  for (const r of out) if (r.status === 'fulfilled') state.space[r.value[0]] = r.value[1];
  loadDonki().catch(() => {});
}

async function loadDonki() {
  const e = new Date(), s = new Date(Date.now() - 3 * 864e5);
  const ds = d => d.toISOString().slice(0, 10);
  const [f, c] = await Promise.allSettled([
    json(`https://api.nasa.gov/DONKI/FLR?startDate=${ds(s)}&endDate=${ds(e)}&api_key=DEMO_KEY`),
    json(`https://api.nasa.gov/DONKI/CME?startDate=${ds(s)}&endDate=${ds(e)}&api_key=DEMO_KEY`)
  ]);
  if (f.status === 'fulfilled') state.space.donkiFlares = f.value;
  if (c.status === 'fulfilled') state.space.donkiCmes = c.value;
  renderSpace();
}

/* ============================================================
   Derived weather values
   ============================================================ */

function nowIndex() {
  if (!state.weather) return 0;
  let best = 0, dist = Infinity;
  state.weather.hourly.time.forEach((t, i) => {
    const d = Math.abs(new Date(t) - Date.now());
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

/* hourly indices covering tonight's 8 PM → 5 AM observing window */
function tonightIdx() {
  if (!state.weather) return [];
  const out = [];
  const now = new Date();
  const start = new Date(now);
  if (now.getHours() < 6) start.setDate(start.getDate() - 1);
  start.setHours(20, 0, 0, 0);
  const end = new Date(start.getTime() + 9 * 3600e3);          // through 5 AM
  state.weather.hourly.time.forEach((t, i) => {
    const d = new Date(t);
    if (d >= start && d <= end) out.push(i);
  });
  return out;
}

function moonIllum(date = new Date()) {
  try {
    if (window.Astronomy) {
      const p = Astronomy.MoonPhase(date);
      return Math.round((1 - Math.cos(p * Math.PI / 180)) * 50);
    }
  } catch {}
  const syn = 29.53058867, ref = Date.UTC(2000, 0, 6, 18, 14);
  const age = ((date.getTime() - ref) / 864e5 % syn + syn) % syn;
  return Math.round((1 - Math.cos(2 * Math.PI * age / syn)) * 50);
}

function moonPhaseAngle(date = new Date()) {
  try { if (window.Astronomy) return Astronomy.MoonPhase(date); } catch {}
  /* fallback: synodic age → elongation angle, same reference as moonIllum() */
  const syn = 29.53058867, ref = Date.UTC(2000, 0, 6, 18, 14);
  const age = ((date.getTime() - ref) / 864e5 % syn + syn) % syn;
  return age / syn * 360;
}

function moonPhaseName(date = new Date()) {
  const a = ((moonPhaseAngle(date) % 360) + 360) % 360;
  if (a < 11.25 || a >= 348.75) return 'New Moon';
  if (a < 78.75)  return 'Waxing Crescent';
  if (a < 101.25) return 'First Quarter';
  if (a < 168.75) return 'Waxing Gibbous';
  if (a < 191.25) return 'Full Moon';
  if (a < 258.75) return 'Waning Gibbous';
  if (a < 281.25) return 'Last Quarter';
  return 'Waning Crescent';
}

function skyScore(i) {
  const h = state.weather.hourly;
  const cloud = +h.cloud_cover[i] || 0;
  const pop   = +h.precipitation_probability[i] || 0;
  const vis   = miles(+h.visibility[i] || 16000);
  const moon  = moonIllum();
  return Math.round(clamp(100 - cloud * .55 - pop * .25 - clamp(10 - vis, 0, 10) * 2 - moon * .08, 0, 100));
}

/* interpolate the hourly sky score into 20-minute buckets for the histogram */
function tonightSeries() {
  const ids = tonightIdx();
  if (ids.length < 2) return { bars: [], times: [] };
  const h = state.weather.hourly;
  const bars = [], times = [];
  for (let k = 0; k < ids.length - 1; k++) {
    const a = skyScore(ids[k]), b = skyScore(ids[k + 1]);
    const t0 = new Date(h.time[ids[k]]).getTime();
    for (let s = 0; s < 3; s++) {
      bars.push(Math.round(a + (b - a) * (s / 3)));
      times.push(new Date(t0 + s * 20 * 60000));
    }
  }
  bars.push(skyScore(ids.at(-1)));
  times.push(new Date(h.time[ids.at(-1)]));
  return { bars, times };
}

function bestWindow(bars, times) {
  if (bars.length < 3) return null;
  const peak = Math.max(...bars);
  const thresh = peak - 2;

  let bestStart = 0, bestLen = 0, i = 0;
  while (i < bars.length) {
    if (bars[i] >= thresh) {
      let j = i;
      while (j < bars.length && bars[j] >= thresh) j++;
      if (j - i > bestLen) { bestLen = j - i; bestStart = i; }
      i = j;
    } else i++;
  }
  if (!bestLen) return null;

  /* On a flawless night the whole span qualifies. Narrow it to the best
     ~2h40m sub-window so the answer stays actionable. */
  const MAX = 8;                                   // 8 × 20 min
  if (bestLen > MAX) {
    let bi = bestStart, bs = -Infinity;
    for (let k = bestStart; k <= bestStart + bestLen - MAX; k++) {
      const mean = bars.slice(k, k + MAX).reduce((a, b) => a + b, 0) / MAX;
      const centred = 1 - Math.abs((k + MAX / 2) - bars.length / 2) / bars.length;
      const score = mean + centred * 4;            // prefer the middle of the night
      if (score > bs) { bs = score; bi = k; }
    }
    bestStart = bi;
    bestLen = MAX;
  }

  const start = times[bestStart];
  const end = new Date(times[Math.min(bestStart + bestLen, times.length - 1)].getTime() + 10 * 60000);
  return { start, end, peak, thresh, from: bestStart, to: bestStart + bestLen };
}

function buildBrief() {
  const w = state.weather, c = w.current, i = nowIndex(), h = w.hourly;
  const t = +c.temperature_2m;
  const lead =
    t >= 88 ? 'Hot outside.' :
    t <= 35 ? 'Cold outside.' :
    (c.is_day ? 'Pleasant day ahead.' : 'Pleasant evening ahead.');

  const rain = Math.max(...h.precipitation_probability.slice(i, i + 6).map(Number));
  const rainTxt =
    rain >= 70 ? 'Rain is likely within a few hours.' :
    rain >= 35 ? 'There is a chance of rain later.' :
                 'Low chance of precipitation.';
  const windTxt =
    +c.wind_gusts_10m >= 30 ? 'Gusty winds.' :
    +c.wind_speed_10m < 12  ? 'Light winds.' :
                              'A steady breeze.';
  return { lead, sub: `${rainTxt} ${windTxt}` };
}

const aqiLabel = a =>
  a <= 50  ? ['Good', 'var(--green)'] :
  a <= 100 ? ['Moderate', 'var(--amber)'] :
  a <= 150 ? ['Sensitive', 'var(--amber)'] :
  a <= 200 ? ['Unhealthy', 'var(--red)'] :
             ['Very unhealthy', 'var(--violet)'];

const uvLabel = u => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme';

/* ============================================================
   Render — master
   ============================================================ */

function renderAll() {
  if (!state.weather) return;
  renderNow();
  renderTonight();
  renderWeather();
  renderSpace();
  renderAstronomy();
  renderCalendar();
  syncHeader(state.page);
}

/* ---------- NOW -------------------------------------------- */

function renderNow() {
  const w = state.weather, c = w.current, i = nowIndex(), h = w.hourly;

  $('heroIcon').innerHTML = c.is_day ? HERO_DAY : HERO_NIGHT;

  $('nowTemp').innerHTML = `${round(c.temperature_2m)}<span class="degree">°F</span>`;
  $('nowCondition').textContent = CODES[c.weather_code] || 'Current conditions';
  $('feelsLike').textContent = `Feels like ${round(c.apparent_temperature)}°`;

  $('humidity').textContent = `${round(c.relative_humidity_2m)}%`;

  const pressIn = +c.pressure_msl / 33.8639;
  const prev = +h.pressure_msl[Math.max(0, i - 3)] / 33.8639;
  const trend = pressIn - prev;
  $('pressure').innerHTML = `${fmt(pressIn, 2)}<span class="unit">in</span>` +
    (Math.abs(trend) > .01 ? `<span class="arrow ${trend < 0 ? 'down' : 'up'}">${trend < 0 ? '↓' : '↑'}</span>` : '');

  $('wind').innerHTML = `${windDir(c.wind_direction_10m)} ${round(c.wind_speed_10m)}<span class="unit">mph</span>`;
  $('gust').textContent = `Wind · Gust ${round(c.wind_gusts_10m)}`;

  const brief = buildBrief();
  $('briefLead').textContent = brief.lead;
  $('briefSub').textContent = brief.sub;

  /* air quality */
  const a = state.air?.current?.us_aqi;
  if (Number.isFinite(+a)) {
    const [t, col] = aqiLabel(+a);
    $('aqi').textContent = Math.round(a);
    $('aqiText').textContent = t;
    $('aqiText').style.color = col;
  } else {
    $('aqi').textContent = '—';
    $('aqiText').textContent = 'Unavailable';
    $('aqiText').style.color = 'var(--dim)';
  }

  /* UV */
  const uv = state.air?.current?.uv_index ?? h.uv_index[i];
  $('uv').textContent = Number.isFinite(+uv) ? Math.round(uv) : '—';
  $('uvText').textContent = uvLabel(+uv);
  $('uvText').style.color = (+uv) < 3 ? 'var(--green)' : (+uv) < 6 ? 'var(--amber)' : 'var(--red)';

  /* sky score */
  const ids = tonightIdx();
  const score = ids.length ? Math.max(...ids.map(skyScore)) : skyScore(i);
  $('skyScore').innerHTML = `${score}<span class="of">/100</span>`;
  const sTxt = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Mixed' : 'Poor';
  $('skyScoreText').textContent = sTxt;
  $('skyScoreText').style.color = score >= 60 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)';

  /* visibility */
  const visRaw = miles(h.visibility[i]);
  const vis = Math.min(visRaw, 10);                    // 10 mi is "unlimited" in practice
  $('visibility').innerHTML = `${Math.round(vis)}<span class="of">mi</span>`;
  $('visDesc').textContent = visRaw >= 10 ? 'Excellent' : visRaw >= 5 ? 'Good' : 'Reduced';
  $('visDesc').style.color = visRaw >= 5 ? 'var(--green)' : 'var(--amber)';

  /* alerts */
  $('alertCount').textContent = state.alerts.length;
  $('alertTitle').textContent = state.alerts.length ? (state.alerts[0].properties?.event || 'Weather alert') : 'Weather alert';
  $('alertText').textContent = state.alerts.length
    ? (state.alerts[0].properties?.headline || 'Active NWS alert in your area').slice(0, 90)
    : 'No active NWS alerts';
  $('homeAlert').classList.toggle('hidden', !state.alerts.length);

  /* teasers */
  const { bars, times } = tonightSeries();
  const win = bestWindow(bars, times);
  $('tonightTeaser').textContent =
    score >= 80 ? `Excellent stargazing conditions${win ? ` after ${timeFmt(win.start)}` : ''}.` :
    score >= 60 ? `A decent viewing window${win ? ` opens around ${timeFmt(win.start)}` : ' should open tonight'}.` :
    score >= 40 ? 'Sky conditions are mixed tonight.' :
                  'Clouds or weather may spoil the sky tonight.';
}

/* ---------- TONIGHT ---------------------------------------- */

function renderTonight() {
  const ids = tonightIdx();
  const h = state.weather.hourly;
  $('tonightDate').textContent = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  if (!ids.length) return;

  const { bars, times } = tonightSeries();
  const best = bars.length ? Math.max(...bars) : Math.max(...ids.map(skyScore));
  const win = bestWindow(bars, times);
  const k = ids[Math.floor(ids.length / 2)];

  const cloud = Math.round(ids.reduce((s, i) => s + (+h.cloud_cover[i] || 0), 0) / ids.length);
  const vis   = Math.round(miles(h.visibility[k]));
  const moon  = moonIllum();
  const seeing = Math.round(clamp(10 - (+h.wind_speed_10m[k] || 0) / 8 - (+h.cloud_cover_low[k] || 0) / 35, 1, 10));
  const trans  = Math.round(clamp(10 - (+h.cloud_cover_high[k] || 0) / 18 - clamp(10 - vis, 0, 10) / 2 - moon / 45, 1, 10));

  const verdict = best >= 80 ? 'YES' : best >= 60 ? 'PROBABLY' : best >= 42 ? 'MAYBE' : 'NOT GREAT';
  const vEl = $('worthOutside');
  vEl.textContent = verdict;
  vEl.className = 'verdict ' + (best >= 70 ? 'green' : best >= 42 ? 'amber' : 'red');

  const lines = [];
  if (best >= 80)      lines.push(`Excellent visibility${win ? ` after ${timeFmt(win.start)}` : ''}.`);
  else if (best >= 60) lines.push(`A usable observing window${win ? ` opens near ${timeFmt(win.start)}` : ''}.`);
  else if (best >= 42) lines.push('Conditions are inconsistent tonight.');
  else                 lines.push('Clouds or weather make tonight a weak sky night.');
  lines.push(cloud < 20 ? 'Thin high clouds only.' : cloud < 45 ? 'Partial cloud through the night.' : 'Substantial cloud cover.');
  lines.push(moon < 25 ? 'Low moon interference.' : moon < 65 ? 'Moderate moonlight.' : 'Bright moon washes out faint objects.');
  $('tonightSummary').textContent = lines.join(' ');

  const set = (id, val, note, pct, tone) => {
    $(id).innerHTML = val;
    $(id + 'Note').textContent = note;
    $(id + 'Note').style.color = tone;
    $(id + 'Bar').style.width = pct + '%';
    $(id + 'Bar').style.background = tone;
  };
  const tone = v => v >= 8 ? 'var(--green)' : v >= 6 ? 'var(--green)' : v >= 4 ? 'var(--amber)' : 'var(--red)';

  set('tSky',   `${best}<span class="of">/100</span>`, best >= 80 ? 'Excellent' : best >= 60 ? 'Good' : best >= 40 ? 'Mixed' : 'Poor', best,
      best >= 60 ? 'var(--green)' : best >= 40 ? 'var(--amber)' : 'var(--red)');
  set('tCloud', `${cloud}%`, cloud < 20 ? 'Low' : cloud < 45 ? 'Moderate' : 'High', 100 - cloud,
      cloud < 20 ? 'var(--green)' : cloud < 45 ? 'var(--amber)' : 'var(--red)');
  set('tMoon',  `${seeing}<span class="of">/10</span>`, seeing >= 8 ? 'Very Good' : seeing >= 6 ? 'Good' : seeing >= 4 ? 'Fair' : 'Poor', seeing * 10, tone(seeing));
  set('tVis',   `${trans}<span class="of">/10</span>`, trans >= 8 ? 'Excellent' : trans >= 6 ? 'Good' : trans >= 4 ? 'Fair' : 'Poor', trans * 10, tone(trans));

  $('bestWindow').textContent = win ? `${timeFmt(win.start)} – ${timeFmt(win.end)}` : 'No clear window tonight';
  /* Bars fade from full green at the peak of the best window out to the
     neutral track colour at the edges of the night. */
  const lo = Math.min(...bars), hi = Math.max(...bars);
  const span = Math.max(hi - lo, 18);              // keep some relief on uniform nights
  const hasRange = win && Number.isFinite(win.from) && Number.isFinite(win.to);
  const centre = hasRange ? (win.from + win.to - 1) / 2 : (bars.length - 1) / 2;
  const reach = hasRange ? Math.max((win.to - win.from) / 2, 2) : bars.length / 4;

  $('qualityBars').innerHTML = bars.map((v, idx) => {
    /* proximity to the peak: 1 at the centre of the window, easing to 0 */
    const d = Math.abs(idx - centre) / (reach * 2.6);
    const near = clamp(1 - d, 0, 1);
    const quality = clamp((v - (hi - span)) / span, 0, 1);
    const heat = clamp(near * .75 + quality * .25, 0, 1);
    const eased = heat * heat * (3 - 2 * heat);    // smoothstep

    const alpha = (Number.isFinite(eased) ? .10 + eased * .90 : .55).toFixed(3);
    const h = 10 + quality * 34;
    return `<div class="quality-bar" style="height:${clamp(h, 8, 46)}px;` +
           `background:rgba(95,215,155,${alpha})"></div>`;
  }).join('');

  renderVisible();
  renderAurora();
  renderLightEvents();
}

/* ---------- Worth Seeing ------------------------------------ */

const THUMBED = new Set(['saturn', 'jupiter', 'mars', 'mercury', 'meteor', 'iss', 'moon', 'eclipse', 'venus', 'sun']);

const ART = {
  moon:   'assets/moon-obj.png',
  saturn: 'assets/saturn-obj.png',
  jupiter:'assets/jupiter-obj.png',
  mars:   'assets/mars-obj.png',
  venus:  'assets/venus-obj.png',
  mercury:'assets/mercury-obj.png',
  meteor: 'assets/meteor-obj.png',
  iss:    'assets/iss-obj.png',
  aurora: 'assets/card-space.jpg',
  sky:    'assets/sky-obj.jpg',
  sun:    'assets/sun-obj.png',
  eclipse:'assets/eclipse-obj.png'
};

function activeShowers(date = new Date()) {
  const m = date.getMonth(), d = date.getDate();
  const inRange = (sm, sd, em, ed) => {
    const cur = m * 100 + d, s = sm * 100 + sd, e = em * 100 + ed;
    return s <= e ? (cur >= s && cur <= e) : (cur >= s || cur <= e);
  };
  return SHOWERS.filter(s => inRange(s[1], s[2], s[3], s[4])).map(s => {
    const peak = new Date(date.getFullYear(), s[5], s[6]);
    const days = Math.round((peak - new Date(date.getFullYear(), m, d)) / 864e5);
    return {
      name: s[0],
      peak,
      meta: days === 0 ? 'Peaks tonight' : days > 0 ? 'Increasing toward peak' : 'Past peak, still active',
      range: `${dateShort(new Date(date.getFullYear(), s[1], s[2]))} – ${dateShort(new Date(date.getFullYear(), s[3], s[4]))}`
    };
  });
}

/* planet visibility for tonight */
function planetsTonight() {
  const out = [];
  if (!window.Astronomy || !Number.isFinite(state.lat)) return out;
  try {
    const obs = new Astronomy.Observer(state.lat, state.lon, 0);
    const now = new Date();
    const evening = new Date(now); evening.setHours(21, 0, 0, 0);
    const midnight = new Date(now); midnight.setHours(24, 30, 0, 0);

    for (const body of ['Venus', 'Mars', 'Jupiter', 'Saturn', 'Mercury']) {
      let when = '', dir = '', sortKey = 9;
      const altAt = t => {
        const eq = Astronomy.Equator(body, t, obs, true, true);
        return Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
      };
      const hEve = altAt(evening);
      const hMid = altAt(midnight);
      let rise = null;
      try { rise = Astronomy.SearchRiseSet(body, obs, 1, now, 1); } catch {}

      if (hEve.altitude > 4) { when = 'Evening'; dir = COMPASS[Math.round(hEve.azimuth / 22.5) % 16]; sortKey = 0; }
      else if (rise?.date && new Date(rise.date) < midnight) {
        when = timeFmt(rise.date);
        const hr = altAt(new Date(new Date(rise.date).getTime() + 30 * 60000));
        dir = COMPASS[Math.round(hr.azimuth / 22.5) % 16];
        sortKey = 1;
      }
      else if (hMid.altitude > 2) { when = 'After Midnight'; dir = COMPASS[Math.round(hMid.azimuth / 22.5) % 16]; sortKey = 2; }
      else continue;

      out.push({ name: body, when, dir, sortKey, type: body.toLowerCase() });
    }
    out.sort((a, b) => a.sortKey - b.sortKey);
  } catch {}
  return out;
}

function renderVisible() {
  const box = $('visibleEvents');
  const rows = [];

  for (const p of planetsTonight().slice(0, 2)) {
    rows.push({ type: p.type, title: p.name, meta: p.when === 'Evening' || p.when === 'After Midnight' ? `Visible ${p.when.toLowerCase()} · ${p.dir}` : `Rises ${p.when}` });
  }

  for (const s of activeShowers()) {
    rows.push({ type: 'meteor', title: `${s.name} Meteor Shower`, meta: s.meta });
  }

  if (state.astro.issPass) {
    const p = state.astro.issPass;
    rows.push({ type: 'iss', title: 'ISS Pass', meta: `${timeFmt(p.start)} – ${timeFmt(p.end)}` });
  }

  const illum = moonIllum();
  if (rows.length < 3) rows.push({ type: 'moon', title: 'Moon', meta: `${illum}% illuminated · ${moonPhaseName()}` });

  if (!rows.length) {
    box.innerHTML = '<div class="event-row"><div class="event-body"><div class="event-meta">Sky geometry is unavailable, but weather scoring still works.</div></div></div>';
    return;
  }

  box.innerHTML = rows.slice(0, 4).map(e => `
    <button class="event-row" data-go="astronomy">
      <span class="event-disc disc-${e.type}"></span>
      <span class="event-body">
        <span class="event-title">${e.title}</span>
        <span class="event-meta">${e.meta}</span>
      </span>
      ${THUMBED.has(e.type) ? `<span class="event-thumb" style="background-image:url('${ART[e.type]}')"></span>` : ''}
      <span class="chev">›</span>
    </button>`).join('');

  qa('[data-go]', box).forEach(b => b.onclick = () => go(b.dataset.go));
}

function renderLightEvents() {
  const box = $('lightEvents');
  try {
    if (!window.Astronomy) throw new Error();
    const obs = new Astronomy.Observer(state.lat, state.lon, 0);
    const now = new Date();
    const events = [];
    for (const [alt, title, note] of [
      [6,   'Golden light ends',      'Sun 6° above horizon'],
      [-4,  'Blue hour deepens',      'Sun 4° below horizon'],
      [-18, 'Astronomical darkness',  'Sun 18° below horizon']
    ]) {
      const t = Astronomy.SearchAltitude('Sun', obs, -1, now, 1, alt);
      if (t?.date) events.push({ title, note, time: t.date });
    }
    box.innerHTML = events.length ? events.map(e => `
      <div class="event-row" style="background:transparent;border:0;padding:8px 0;margin:0">
        <span class="event-body"><span class="event-title">${e.title}</span><span class="event-meta">${e.note}</span></span>
        <span class="event-side">${timeFmt(e.time)}</span>
      </div>`).join('') : '<div class="event-meta">No further light transition tonight.</div>';
  } catch {
    box.innerHTML = '<div class="event-meta">Twilight calculation unavailable.</div>';
  }
}

/* SWPC serves some feeds as [header, ...rows] and others as [{...}, ...].
   Walk backwards for the newest record that actually carries the fields we need. */
function lastValid(feed, fields) {
  if (!Array.isArray(feed) || !feed.length) return null;

  if (Array.isArray(feed[0])) {                       // [header, ...rows]
    const head = feed[0].map(h => String(h).trim());
    const idx = {};
    for (const f of fields) {
      const i = head.findIndex(h => f.aliases.includes(h));
      if (i < 0) return null;
      idx[f.name] = i;
    }
    for (let r = feed.length - 1; r > 0; r--) {
      const out = {};
      let ok = true;
      for (const f of fields) {
        const v = +feed[r][idx[f.name]];
        if (!Number.isFinite(v)) { ok = false; break; }
        out[f.name] = v;
      }
      if (ok) return out;
    }
    return null;
  }

  for (let r = feed.length - 1; r >= 0; r--) {        // [{...}, ...]
    const row = feed[r];
    const out = {};
    let ok = true;
    for (const f of fields) {
      const key = f.aliases.find(a => row[a] != null && Number.isFinite(+row[a]));
      if (!key) { ok = false; break; }
      out[f.name] = +row[key];
    }
    if (ok) return out;
  }
  return null;
}

function spaceVals() {
  let kp, wind, density, bz, bt;
  try {
    const k = lastValid(state.space.kp, [{ name: 'kp', aliases: ['Kp', 'kp', 'kp_index', 'estimated_kp'] }]);
    if (k) kp = k.kp;

    const p = lastValid(state.space.plasma, [
      { name: 'speed',   aliases: ['proton_speed', 'speed'] },
      { name: 'density', aliases: ['proton_density', 'density'] }
    ]);
    if (p) { wind = p.speed; density = p.density; }

    const m = lastValid(state.space.mag, [
      { name: 'bz', aliases: ['bz_gsm', 'bz', 'Bz'] },
      { name: 'bt', aliases: ['bt', 'Bt'] }
    ]);
    if (m) { bz = m.bz; bt = m.bt; }
  } catch {}
  return { kp, wind, density, bz, bt };
}

function renderAurora() {
  const { kp, bz, wind } = spaceVals();
  let chance = 0;
  if (Number.isFinite(kp)) {
    const threshold = 9 - (Math.abs(state.lat) - 40) * .18;
    chance = clamp((kp - threshold + 1.3) * 24, 1, 95);
    if (Number.isFinite(bz) && bz < 0) chance += clamp(-bz * 1.4, 0, 15);
    if (Number.isFinite(wind) && wind > 500) chance += clamp((wind - 500) / 20, 0, 10);
    chance = Math.round(clamp(chance, 1, 98));
  }
  $('auroraPct').textContent = Number.isFinite(kp) ? chance + '%' : '—';
  $('auroraRing').style.setProperty('--p', chance + '%');
  $('auroraTitle').textContent =
    chance >= 55 ? 'Aurora conditions are worth watching' :
    chance >= 20 ? 'Aurora possible with further improvement' :
                   'Not expected this far south tonight.';
  $('auroraDesc').textContent = Number.isFinite(kp)
    ? `Kp ${fmt(kp, 1)}${Number.isFinite(bz) ? ` · Bz ${fmt(bz, 1)} nT` : ''}. Local heuristic, not an official probability.`
    : 'Live geomagnetic data is unavailable.';
}

/* ---------- WEATHER ---------------------------------------- */

function renderWeather() {
  const w = state.weather, c = w.current, i = nowIndex(), h = w.hourly, d = w.daily;

  $('wTemp').innerHTML = `${round(c.temperature_2m)}<span class="degree">°F</span>`;
  $('wCond').textContent = CODES[c.weather_code] || 'Current conditions';
  $('wSub').textContent = `Feels like ${round(c.apparent_temperature)}°`;
  /* night → real moon photo; day → soft solar disc drawn in CSS */
  const wPhoto = $('wPhoto');
  if (c.is_day) {
    wPhoto.style.backgroundImage = 'radial-gradient(circle at 38% 32%,#ffeaa6,#f2b845 44%,#c8831d 76%,#734911 100%)';
    wPhoto.style.boxShadow = '0 0 30px rgba(242,184,69,.20)';
  } else {
    wPhoto.style.backgroundImage = "url('assets/moon-photo.jpg')";
    wPhoto.style.boxShadow = 'none';
  }

  $('wHigh').textContent = `H ${round(d.temperature_2m_max[0])}°`;
  $('wLow').textContent  = `L ${round(d.temperature_2m_min[0])}°`;
  $('wHumidity').textContent = `${round(c.relative_humidity_2m)}%`;

  const pressIn = +c.pressure_msl / 33.8639;
  const prev = +h.pressure_msl[Math.max(0, i - 3)] / 33.8639;
  const trend = pressIn - prev;
  $('wPressure').innerHTML = `${fmt(pressIn, 2)}<span class="unit">in</span>` +
    (Math.abs(trend) > .01 ? `<span class="arrow ${trend < 0 ? 'down' : 'up'}">${trend < 0 ? '↓' : '↑'}</span>` : '');

  $('rainChance').textContent = `${round(d.precipitation_probability_max[0] || 0)}%`;
  drawPrecip();
  drawTemp();
  renderHours();
  renderDaily();

  /* advanced */
  $('dDew').textContent = `${round(h.dew_point_2m[i])}°`;
  const cape = +h.cape[i] || 0;
  $('dCape').textContent = Math.round(cape);
  $('dCapeText').textContent = cape < 300 ? 'Low' : cape < 1000 ? 'Some' : cape < 2500 ? 'Moderate' : 'High';
  $('dCloudBase').textContent = Number.isFinite(+h.cloud_base[i]) ? `${Math.round(feet(h.cloud_base[i]))} ft` : '—';
  $('dFreeze').textContent = Number.isFinite(+h.freezing_level_height[i]) ? `${Math.round(feet(h.freezing_level_height[i]))} ft` : '—';
  $('cloudLayers').innerHTML = [['Low', h.cloud_cover_low[i]], ['Mid', h.cloud_cover_mid[i]], ['High', h.cloud_cover_high[i]]]
    .map(([n, v]) => `<div class="model-row"><div class="model-name">${n}</div><div class="model-track"><div class="model-fill" style="width:${v || 0}%"></div></div><div class="model-value">${Math.round(v || 0)}%</div></div>`).join('');
  $('dSolar').textContent = Math.round(h.shortwave_radiation[i] || 0);
  $('dRain').textContent  = fmt(h.rain[i] || 0, 2);
  $('dGust').textContent  = Math.round(h.wind_gusts_10m[i] || 0);
  $('dUv').textContent    = fmt(state.air?.current?.uv_index ?? h.uv_index[i], 1);
}

function drawPrecip() {
  const s = $('precipChart');
  const h = state.weather.hourly, i = nowIndex();
  const v = h.precipitation_probability.slice(i, i + 25).map(x => +x || 0);
  const t = h.time.slice(i, i + 25);
  if (v.length < 2) return;

  const W = 360, H = 86, floor = H;
  const x = j => j * W / (v.length - 1);
  const peak = Math.max(20, Math.max(...v));
  const y = n => floor - (n / peak) * (H - 8);
  const line = v.map((n, j) => `${x(j)},${y(n)}`).join(' ');
  const area = `M 0 ${floor} L ${v.map((n, j) => `${x(j)} ${y(n)}`).join(' L ')} L ${W} ${floor} Z`;

  s.innerHTML =
    `<defs><linearGradient id="rainFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f7fc4" stop-opacity=".85"/>
      <stop offset="1" stop-color="#1d4f80" stop-opacity=".35"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#rainFade)"/>
    <polyline points="${line}" fill="none" stroke="#7cc4f5" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;

  const ticks = [0, 6, 12, 18, 24].filter(j => j < t.length);
  $('precipAxis').innerHTML = ticks.map((j, n) => `<span>${n === 0 ? 'Now' : hourFmt(t[j])}</span>`).join('');
}

function drawTemp() {
  const s = $('tempChart');
  const h = state.weather.hourly, i = nowIndex();
  const v = h.temperature_2m.slice(i, i + 24).map(Number);
  const t = h.time.slice(i, i + 24);
  if (v.length < 2) return;

  const W = 560, H = 180, p = 24;
  const lo = Math.min(...v) - 2, hi = Math.max(...v) + 2;
  const x = j => p + j * (W - 2 * p) / (v.length - 1);
  const y = n => H - p - (n - lo) * (H - 2 * p) / (hi - lo || 1);
  const pts = v.map((n, j) => `${x(j)},${y(n)}`).join(' ');
  const area = `M ${x(0)} ${H - p} L ${v.map((n, j) => `${x(j)} ${y(n)}`).join(' L ')} L ${x(v.length - 1)} ${H - p} Z`;

  let labels = '';
  for (let j = 0; j < v.length; j += 6) {
    labels += `<text class="chart-label" x="${x(j)}" y="${H - 5}" text-anchor="middle">${hourFmt(t[j])}</text>` +
              `<text class="chart-label" x="${x(j)}" y="${y(v[j]) - 8}" text-anchor="middle">${Math.round(v[j])}°</text>`;
  }
  s.innerHTML =
    `<defs><linearGradient id="weatherFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#63b3ef" stop-opacity=".24"/>
      <stop offset="1" stop-color="#63b3ef" stop-opacity="0"/>
    </linearGradient></defs>
    <line class="chart-grid" x1="${p}" y1="${H - p}" x2="${W - p}" y2="${H - p}"/>
    <path class="chart-area" d="${area}"/>
    <polyline class="chart-line" points="${pts}"/>${labels}`;
}

function renderHours() {
  const h = state.weather.hourly, i = nowIndex();
  $('hourStrip').innerHTML = h.time.slice(i, i + 18).map((t, j) => {
    const k = i + j;
    return `<div class="hour">
      <div class="hour-time">${j ? hourFmt(t) : 'Now'}</div>
      <div class="hour-icon">${svgIcon(codeIcon(h.weather_code[k], h.is_day[k]))}</div>
      <div class="hour-temp">${round(h.temperature_2m[k])}°</div>
    </div>`;
  }).join('');
}

function renderDaily() {
  const d = state.weather.daily;
  const lo = Math.min(...d.temperature_2m_min), hi = Math.max(...d.temperature_2m_max);
  $('dailyForecast').innerHTML = d.time.map((t, i) => {
    const min = +d.temperature_2m_min[i], max = +d.temperature_2m_max[i];
    const left = (min - lo) / (hi - lo || 1) * 100;
    const width = Math.max(10, (max - min) / (hi - lo || 1) * 100);
    const pop = Math.round(d.precipitation_probability_max[i] || 0);
    return `<div class="daily-row">
      <div class="daily-name">${i ? dayFmt(t) : 'Today'}</div>
      <div class="daily-icon">${svgIcon(codeIcon(d.weather_code[i], 1))}</div>
      <div class="daily-rain">${pop ? pop + '%' : ''}</div>
      <div class="daily-range">
        <span class="daily-lo">${Math.round(min)}°</span>
        <span class="temp-range"><i style="left:${left}%;width:${Math.min(width, 100 - left)}%"></i></span>
        <span class="daily-hi">${Math.round(max)}°</span>
      </div>
    </div>`;
  }).join('');
}

/* ---------- SPACE WEATHER ---------------------------------- */

function renderSpace() {
  const { kp, wind, density, bz, bt } = spaceVals();

  $('kpValue').textContent = Number.isFinite(kp) ? fmt(kp, 1) : '—';
  const kpTone = !Number.isFinite(kp) ? '' : kp < 4 ? 'var(--green)' : kp < 6 ? 'var(--amber)' : 'var(--red)';
  $('kpValue').style.color = kpTone;
  const kpLab = !Number.isFinite(kp) ? 'Unavailable'
    : kp < 3 ? 'Quiet' : kp < 4 ? 'Unsettled' : kp < 5 ? 'Active' : kp < 6 ? 'G1 storm' : kp < 7 ? 'G2 storm' : 'Major storm';
  $('kpLabel').textContent = kpLab;
  $('kpLabel').style.color = kpTone;

  /* the preview draws each Kp step as a little 3-bar group, lit up to the current index */
  const kpRounded = Number.isFinite(kp) ? Math.round(kp) : -1;
  const heights = [[46, 62, 52], [78, 96, 84], [50, 66, 44], [26, 34, 28],
                   [16, 20, 16], [12, 15, 12], [10, 12, 10], [8, 10, 8], [7, 9, 7], [6, 8, 6]];
  $('kpScale').innerHTML = Array.from({ length: 10 }, (_, i) => {
    const on = i <= kpRounded;
    const cls = on ? (i >= 6 ? 'on bad' : i >= 4 ? 'on warn' : 'on') : '';
    const bars = on ? heights[i].map(h => `<i style="height:${h}%"></i>`).join('')
                    : '<i class="flat"></i>';
    return `<div class="kp-box ${cls}">${bars}</div>`;
  }).join('');
  $('kpNums').innerHTML = Array.from({ length: 10 }, (_, i) =>
    `<span class="${i <= kpRounded ? 'on' : ''}">${i}</span>`).join('');

  const windArrow = Number.isFinite(wind) ? (wind > 500 ? '<span class="trend up">↑</span>' : '<span class="trend down">↓</span>') : '';
  $('solarWind').innerHTML = Number.isFinite(wind)
    ? `${Math.round(wind)}<span class="unit">km/s</span>${windArrow}` : '—';
  $('solarWindDesc').textContent = Number.isFinite(wind) ? (wind > 600 ? 'Fast' : wind > 450 ? 'Elevated' : 'Speed') : 'Unavailable';

  const bzArrow = Number.isFinite(bz)
    ? (bz < 0 ? '<span class="trend bad">↓</span>' : '<span class="trend up">↑</span>') : '';
  $('bz').innerHTML = Number.isFinite(bz) ? `${fmt(bz, 1)}<span class="unit">nT</span>${bzArrow}` : '—';
  $('bzDesc').textContent = Number.isFinite(bz) ? (bz < 0 ? 'South' : 'North') : 'nT';
  $('bzDesc').className = 'solar-desc ' + (Number.isFinite(bz) ? (bz < 0 ? 'south' : 'north') : '');

  $('density').innerHTML = Number.isFinite(density) ? `${fmt(density, 1)}<span class="unit">p/cm³</span>` : '—';
  $('bt').innerHTML = Number.isFinite(bt) ? `${fmt(bt, 1)}<span class="unit">nT</span>` : '—';

  renderSunspots();
  drawXray();
  renderSolarEvents();
  renderScales();

  if (state.page === 'space') $('screenSubtitle').textContent = agoFmt(state.updatedAt);

  $('spaceTeaser').innerHTML = !Number.isFinite(kp)
    ? 'Live NOAA data unavailable'
    : (kp >= 5 ? `Storm conditions.<br>Aurora possible.` :
       bz < -5 ? `Southward Bz ${fmt(bz, 1)} nT.<br>Aurora watch.` :
                 `Quiet conditions.<br>Aurora unlikely.`);
  const badge = $('spaceBadge');
  badge.style.display = Number.isFinite(kp) && kp < 5 ? 'grid' : 'none';
}

function renderSunspots() {
  const a = state.space.sunspots;
  const svg = $('sunspotChart');
  if (!Array.isArray(a)) { $('sunspotNumber').textContent = '—'; svg.innerHTML = ''; return; }
  const s = a.map(x => ({
    t: x['time-tag'] || x.time_tag || x.date || x.time,
    v: +(x['ssn'] ?? x.ssn ?? x['sunspot_number'] ?? x.value)
  })).filter(x => x.t && Number.isFinite(x.v)).sort((p, q) => new Date(p.t) - new Date(q.t)).slice(-72);

  if (!s.length) { $('sunspotNumber').textContent = '—'; svg.innerHTML = ''; return; }
  $('sunspotNumber').textContent = Math.round(s.at(-1).v);

  const W = 360, H = 52, p = 0;
  const vals = s.map(x => x.v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = i => p + i * (W - 2 * p) / (vals.length - 1);
  const y = v => H - p - (v - lo) / (hi - lo || 1) * (H - 2 * p);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `M ${x(0)} ${H} L ${vals.map((v, i) => `${x(i)} ${y(v)}`).join(' L ')} L ${x(vals.length - 1)} ${H} Z`;
  svg.innerHTML =
    `<defs>
      <linearGradient id="ssFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5fd79b" stop-opacity=".22"/>
        <stop offset="1" stop-color="#5fd79b" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="ssLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3f8fd0"/><stop offset=".5" stop-color="#5fd79b"/>
        <stop offset="1" stop-color="#4ba3e0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#ssFade)"/>
    <polyline points="${pts}" fill="none" stroke="url(#ssLine)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
}

function xrayData() {
  return Array.isArray(state.space.xray)
    ? state.space.xray.filter(x => x.energy === '0.1-0.8nm' && Number.isFinite(+x.flux))
        .sort((a, b) => new Date(a.time_tag) - new Date(b.time_tag))
    : [];
}

function fluxClass(v) {
  if (!Number.isFinite(v) || v <= 0) return '—';
  for (const [c, b] of [['X', 1e-4], ['M', 1e-5], ['C', 1e-6], ['B', 1e-7], ['A', 1e-8]])
    if (v >= b) return c + (v / b).toFixed(1);
  return 'A' + (v / 1e-8).toFixed(1);
}

function drawXray() {
  const s = $('xrayChart'), a = xrayData();
  if (a.length < 2) { s.innerHTML = '<text x="20" y="80" fill="#5f6d7a" font-size="12">Live X-ray data unavailable.</text>'; return; }
  const v = a.map(x => +x.flux);
  const W = 560, H = 160, p = 24;
  const x = i => p + i * (W - 2 * p) / (v.length - 1);
  const y = n => H - p - ((Math.log10(Math.max(n, 1e-9)) + 8) / 5) * (H - 2 * p);
  const pts = v.map((n, i) => `${x(i)},${y(n)}`).join(' ');
  let g = '';
  for (const [lab, pow] of [['B', -7], ['C', -6], ['M', -5], ['X', -4]])
    g += `<line x1="${p}" y1="${y(10 ** pow)}" x2="${W - p}" y2="${y(10 ** pow)}" stroke="rgba(255,255,255,.07)"/>` +
         `<text x="3" y="${y(10 ** pow) + 3}" fill="#5f6d7a" font-size="9">${lab}</text>`;
  s.innerHTML = `${g}<polyline points="${pts}" fill="none" stroke="#3ddc84" stroke-width="2"/>` +
    `<text x="${W - p}" y="18" text-anchor="end" fill="#8d9ba8" font-size="11">Now ${fluxClass(v.at(-1))}</text>`;
}

function solarEvents() {
  const ev = [];
  for (const f of [...(state.space.donkiFlares || [])].reverse())
    ev.push({ title: f.classType || 'Flare', time: f.peakTime || f.beginTime, source: 'NASA DONKI' });
  for (const c of [...(state.space.donkiCmes || [])].reverse().slice(0, 3))
    ev.push({ title: 'CME', time: c.startTime, source: 'NASA DONKI' });
  ev.sort((a, b) => new Date(b.time) - new Date(a.time));
  if (!ev.length) {
    const x = xrayData().at(-1);
    if (x) ev.push({ title: fluxClass(+x.flux), time: x.time_tag, source: 'NOAA GOES' });
  }
  return ev;
}

function renderSolarEvents() {
  const ev = solarEvents();
  const cls = t => /^X/.test(t) ? 'x' : /^M/.test(t) ? 'm' : '';
  $('flareList').innerHTML = ev.slice(0, 2).map(e => `
    <div>
      <div class="flare-class ${cls(e.title)}">${e.title}</div>
      <div class="flare-time">${e.time ? timeFmt(e.time) : '—'}</div>
    </div>`).join('') || '<div class="event-meta">No flares reported in the last 24 hours.</div>';
}

function renderFlareModal() {
  const ev = solarEvents();
  $('flareModalBody').innerHTML = ev.length ? ev.slice(0, 12).map(e => `
    <div class="event-row">
      <span class="event-disc disc-sun"></span>
      <span class="event-body">
        <span class="event-title">${e.title}</span>
        <span class="event-meta">${e.time ? new Date(e.time).toLocaleString() : 'Time unavailable'}</span>
      </span>
      <span class="event-side">${e.source}</span>
    </div>`).join('') : '<div class="event-meta">No recent solar events reported.</div>';
}

function scaleValues() {
  const vals = { R: 'R0', S: 'S0', G: 'G0' };
  try {
    const s = state.space.scales;
    if (Array.isArray(s) && s.length) {
      for (const k of ['R', 'S', 'G']) if (s[0][k]?.Scale != null) vals[k] = k + s[0][k].Scale;
    } else if (s) {
      for (const k of ['R', 'S', 'G']) if (s[k]?.Scale != null) vals[k] = k + s[k].Scale;
      if (s['0']) for (const k of ['R', 'S', 'G']) if (s['0'][k]?.Scale != null) vals[k] = k + s['0'][k].Scale;
    }
  } catch {}
  return vals;
}

const SCALE_WORD = n => ['None', 'Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'][n] || 'None';

function renderScales() {
  const vals = scaleValues();
  const info = {
    R: ['Radio blackout', 'Solar X-rays affecting HF radio'],
    S: ['Radiation storm', 'Energetic solar particles'],
    G: ['Geomagnetic storm', 'Disturbance of Earth’s magnetic field']
  };
  const html = ['R', 'S', 'G'].map(k => {
    const n = +vals[k].slice(1) || 0;
    const tone = n === 0 ? '' : n <= 2 ? 'warn' : 'bad';
    return `<div class="scale-row">
      <div class="scale-code">${k}</div>
      <div class="scale-body"><div class="scale-title">${info[k][0]}</div><div class="scale-desc">${info[k][1]}</div></div>
      <div class="scale-val ${tone}">${vals[k]} · ${SCALE_WORD(n)}</div>
    </div>`;
  }).join('');
  $('noaaScales').innerHTML = html;
  $('scalesModalBody').innerHTML = html;

  const sN = +vals.S.slice(1) || 0;
  $('radiationScale').textContent = vals.S;
  const el = $('radiationDesc');
  el.innerHTML = `<span style="color:${sN <= 1 ? 'var(--green)' : sN <= 3 ? 'var(--amber)' : 'var(--red)'}">${SCALE_WORD(sN)}</span><span class="chev">›</span>`;
  el.className = 'radiation-state';
}

/* ---------- ASTRONOMY -------------------------------------- */

function renderAstronomy() {
  const now = new Date();

  /* moon */
  const illum = moonIllum(now);
  $('moonPct').innerHTML = `${illum}<span class="unit">%</span>`;
  $('moonPhase').textContent = moonPhaseName(now);

  let rise = null, set = null;
  try {
    if (window.Astronomy && Number.isFinite(state.lat)) {
      const obs = new Astronomy.Observer(state.lat, state.lon, 0);
      rise = Astronomy.SearchRiseSet('Moon', obs, +1, now, 2)?.date;
      set  = Astronomy.SearchRiseSet('Moon', obs, -1, now, 2)?.date;
    }
  } catch {}
  $('moonRise').textContent = rise ? timeFmt(rise) : '—';
  $('moonSet').textContent  = set ? timeFmt(set) : '—';

  /* planets */
  const planets = planetsTonight();
  $('planetList').innerHTML = planets.length ? planets.map(p => `
    <button class="planet-row">
      <span class="event-disc disc-${p.type}"></span>
      <span class="planet-name">${p.name}</span>
      <span class="planet-right">
        <span class="planet-when">${p.when}</span>
        <span class="planet-dir">${p.dir}</span>
      </span>
      <span class="chev">›</span>
    </button>`).join('')
    : '<div class="plain-row"><span class="event-meta">No bright planets are well placed tonight.</span></div>';

  /* other highlights */
  const hi = [];
  for (const s of activeShowers(now)) {
    hi.push({ type: 'meteor', title: `${s.name} Meteor Shower`, meta: s.meta });
  }
  if (state.astro.issPass) {
    const p = state.astro.issPass;
    hi.push({ type: 'iss', title: 'ISS Pass', meta: `${timeFmt(p.start)} – ${timeFmt(p.end)}` });
  }
  for (const sh of SHOWERS) {
    if (hi.length >= 3) break;
    const yr = now.getFullYear();
    const start = new Date(yr, sh[1], sh[2]), end = new Date(yr, sh[3], sh[4]);
    if (end < now || hi.some(x => x.title.startsWith(sh[0]))) continue;
    hi.push({ type: 'meteor', title: sh[0], meta: `${dateShort(start)} – ${dateShort(end)}` });
  }
  const nextEv = state.astro.events?.[0];
  if (nextEv && hi.length < 3) {
    hi.push({ type: artType(nextEv.title), title: nextEv.title, meta: `${dateShort(nextEv.date)} · ${nextEv.desc}` });
  }

  $('astroHighlights').innerHTML = hi.length ? hi.map(e => `
    <button class="plain-row">
      <span class="event-thumb" style="background-image:url('${ART[e.type] || ART.sky}')"></span>
      <span class="event-body">
        <span class="event-title">${e.title}</span>
        <span class="event-meta">${e.meta}</span>
      </span>
      <span class="chev">›</span>
    </button>`).join('')
    : '<div class="plain-row"><span class="event-meta">Nothing unusual on the calendar tonight.</span></div>';
}

/* ---------- ISS (progressive enhancement) ------------------ */

async function ensureSatelliteJs() {
  if (window.satellite) return true;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return !!window.satellite;
}

async function issTle() {
  try {
    const cached = JSON.parse(localStorage.getItem('skylab-iss-tle') || 'null');
    if (cached && Date.now() - cached.at < 12 * 3600e3) return cached.lines;
  } catch {}
  const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE');
  if (!r.ok) throw new Error('tle');
  const lines = (await r.text()).trim().split('\n').map(s => s.trim());
  if (lines.length < 3) throw new Error('tle');
  localStorage.setItem('skylab-iss-tle', JSON.stringify({ at: Date.now(), lines }));
  return lines;
}

/* find the next visible ISS pass in the next 24h (>10° elevation, sunlit sat, dark sky) */
async function loadIss() {
  if (!Number.isFinite(state.lat)) return;
  if (!await ensureSatelliteJs()) return;
  const lines = await issTle();
  const satrec = satellite.twoline2satrec(lines[1], lines[2]);
  const gd = {
    longitude: satellite.degreesToRadians(state.lon),
    latitude:  satellite.degreesToRadians(state.lat),
    height:    0.1
  };

  const step = 30000;                                  // 30s
  let pass = null, cur = null;
  for (let t = Date.now(); t < Date.now() + 24 * 3600e3; t += step) {
    const d = new Date(t);
    let el;
    try {
      const pv = satellite.propagate(satrec, d);
      if (!pv.position) continue;
      const gmst = satellite.gstime(d);
      const look = satellite.ecfToLookAngles(gd, satellite.eciToEcf(pv.position, gmst));
      el = satellite.radiansToDegrees(look.elevation);
    } catch { continue; }

    if (el > 10) {
      if (!cur) cur = { start: d, max: el, end: d };
      else { cur.end = d; cur.max = Math.max(cur.max, el); }
    } else if (cur) {
      /* only count passes during local darkness */
      const hr = cur.start.getHours();
      if (hr >= 19 || hr <= 6) { pass = cur; break; }
      cur = null;
    }
  }
  if (pass) {
    state.astro.issPass = { start: pass.start, end: pass.end, mag: Math.round(pass.max) + '°' };
  }
}

/* ---------- CALENDAR --------------------------------------- */

function artType(title = '') {
  const t = title.toLowerCase();
  if (t.includes('meteor')) return 'meteor';
  if (t.includes('aurora') || t.includes('geomagnetic')) return 'aurora';
  if (t.includes('iss')) return 'iss';
  if (t.includes('saturn')) return 'saturn';
  if (t.includes('eclipse')) return 'eclipse';
  if (t.includes('equinox') || t.includes('solstice')) return 'sun';
  if (t.includes('moon')) return 'moon';
  return 'sky';
}

function loadAstronomy() {
  const ev = [];
  const now = new Date();
  try {
    if (!window.Astronomy) throw new Error();

    /* moon phases */
    let q = Astronomy.SearchMoonQuarter(now);
    const names = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'];
    for (let n = 0; n < 6; n++) {
      const d = q.time.date || q.time;
      ev.push({ date: new Date(d), title: names[q.quarter], desc: n === 0 && q.quarter === 0 ? '0% illumination' : 'Moon phase', tag: 'Moon Phase' });
      q = Astronomy.NextMoonQuarter(q);
    }

    /* seasons */
    const sea = Astronomy.Seasons(now.getFullYear());
    for (const [k, t] of [['mar_equinox', 'March equinox'], ['jun_solstice', 'June solstice'], ['sep_equinox', 'September equinox'], ['dec_solstice', 'December solstice']]) {
      const d = sea[k]?.date || sea[k];
      if (d && new Date(d) > now) ev.push({ date: new Date(d), title: t, desc: 'Seasonal solar event', tag: 'Sun' });
    }

    /* eclipses */
    try {
      const x = Astronomy.SearchGlobalSolarEclipse(now);
      const d = x.peak?.date || x.peak;
      if (d) ev.push({ date: new Date(d), title: 'Solar eclipse', desc: `Global · ${x.kind || 'event'}`, tag: 'Eclipse' });
    } catch {}
    try {
      const x = Astronomy.SearchLunarEclipse(now);
      const d = x.peak?.date || x.peak;
      if (d) ev.push({ date: new Date(d), title: 'Lunar eclipse', desc: `${x.kind || 'event'}`, tag: 'Eclipse' });
    } catch {}

    /* lunar apsides */
    try {
      let ap = Astronomy.SearchLunarApsis(now);
      for (let n = 0; n < 2; n++) {
        const d = ap.time.date || ap.time;
        ev.push({
          date: new Date(d),
          title: ap.kind === 0 ? 'Moon at Perigee' : 'Moon at Apogee',
          desc: ap.kind === 0 ? 'Closest approach' : 'Farthest point',
          tag: 'Moon'
        });
        ap = Astronomy.NextLunarApsis(ap);
      }
    } catch {}
  } catch {}

  /* meteor showers */
  for (const s of SHOWERS) {
    let peak = new Date(now.getFullYear(), s[5], s[6], 23);
    if (peak < now) peak = new Date(now.getFullYear() + 1, s[5], s[6], 23);
    const start = new Date(peak.getFullYear(), s[1], s[2]);
    const end   = new Date(peak.getFullYear(), s[3], s[4]);
    ev.push({
      date: peak, start, end,
      title: `${s[0]} Meteor Shower`,
      desc: `Peak ${dateShort(peak)}`,
      tag: 'Meteor Shower',
      range: true
    });
  }

  state.astro.events = ev
    .filter(e => new Date(e.date) > new Date(Date.now() - 864e5))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderCalendarWeek() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  $('calendarWeek').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isToday = d.toDateString() === now.toDateString();
    return `<div class="week-day">
      <div class="week-name">${d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3)}</div>
      <div class="week-num ${isToday ? 'today' : ''}">${d.getDate()}</div>
    </div>`;
  }).join('');
}

function whenLabel(e) {
  const d = new Date(e.date);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Tonight';
  if (e.range && e.start && e.end) {
    const s = new Date(e.start), en = new Date(e.end);
    return s.getMonth() === en.getMonth()
      ? `${s.toLocaleString(undefined, { month: 'short' })} ${s.getDate()} – ${en.getDate()}`
      : `${dateShort(s)} – ${dateShort(en)}`;
  }
  return dateShort(d);
}

function renderCalendar() {
  renderCalendarWeek();
  const ev = state.astro.events;

  /* a live "tonight" entry from the sky score */
  const rows = [];
  if (state.weather) {
    const ids = tonightIdx();
    const score = ids.length ? Math.max(...ids.map(skyScore)) : 0;
    const { bars, times } = tonightSeries();
    const win = bestWindow(bars, times);
    rows.push({
      when: 'Tonight',
      type: 'sky',
      title: score >= 80 ? 'Clear skies' : score >= 60 ? 'Decent viewing' : 'Mixed conditions',
      desc: win ? `Excellent after ${timeFmt(win.start)}` : `Sky score ${score}/100`,
      tag: 'Sky'
    });
  }

  for (const e of ev.slice(0, 10)) {
    rows.push({ when: whenLabel(e), type: artType(e.title), title: e.title, desc: e.desc, tag: e.tag || '' });
  }

  if (!rows.length) {
    $('calendarEvents').innerHTML = '<div class="event-meta" style="padding:10px 2px">Astronomy Engine did not load, so the calculated sky calendar is unavailable.</div>';
    return;
  }

  $('calendarEvents').innerHTML = rows.map(r => `
    <div class="cal-when">${r.when}</div>
    <div class="cal-event">
      <span class="cal-art" style="background-image:url('${ART[r.type] || ART.sky}')"></span>
      <span class="event-body">
        <span class="cal-title">${r.title}</span>
        <span class="cal-desc">${r.desc}</span>
        <span class="cal-tag">${r.tag}</span>
      </span>
      <span class="chev">›</span>
    </div>`).join('');

  const f = ev[0];
  if (f) {
    $('nextEventTeaser').textContent = `${f.title} · ${dateShort(f.date)}`;
    $('nextEventArt').style.backgroundImage = `url('${ART[artType(f.title)] || ART.sky}')`;
  }
}

/* ============================================================
   Model comparison
   ============================================================ */

const MODELS = [
  ['HRRR',  'gfs_hrrr'],
  ['ECMWF', 'ecmwf_ifs025'],
  ['ICON',  'icon_seamless'],
  ['GFS',   'gfs_seamless'],
  ['GEM',   'gem_seamless']
];

const METRICS = {
  temperature:   { field: 'temperature_2m',              label: 'Temperature',        unit: '°',    dp: 0, spread: 8  },
  precipitation: { field: 'precipitation_probability',   label: 'Precipitation Chance', unit: '%',  dp: 0, spread: 45 },
  wind:          { field: 'wind_speed_10m',              label: 'Wind Speed',         unit: ' mph', dp: 0, spread: 14 },
  snow:          { field: 'snowfall',                    label: 'Snowfall',           unit: '″',    dp: 2, spread: 1.5 }
};

qa('[data-model-tab]').forEach(b => b.onclick = () => {
  qa('[data-model-tab]').forEach(x => x.classList.toggle('active', x === b));
  state.modelTab = b.dataset.modelTab;
  renderModels();
});

async function loadModels(force = false) {
  if (state.models && !force) return renderModels();
  if (!Number.isFinite(state.lat)) {
    $('modelRows').innerHTML = '<div class="event-meta">Waiting for a location…</div>';
    return;
  }
  $('modelRows').innerHTML = '<div class="event-meta">Loading model guidance…</div>';
  try {
    const fields = ['temperature_2m', 'precipitation_probability', 'wind_speed_10m', 'snowfall'].join(',');
    const d = await json(
      `https://api.open-meteo.com/v1/forecast?latitude=${state.lat}&longitude=${state.lon}` +
      `&hourly=${fields}&models=${MODELS.map(m => m[1]).join(',')}` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=3`
    );
    /* target: tomorrow at 3 PM local */
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(15, 0, 0, 0);
    const ti = d.hourly.time.reduce((b, t, i) =>
      Math.abs(new Date(t) - target) < Math.abs(new Date(d.hourly.time[b]) - target) ? i : b, 0);

    state.models = { data: d, ti, time: d.hourly.time[ti] };
    renderModels();
  } catch {
    $('modelRows').innerHTML = '<div class="event-meta">Individual model comparison is temporarily unavailable. The main forecast still uses Open-Meteo’s best-match blend.</div>';
  }
}

function renderModels() {
  const m = state.models;
  const metric = METRICS[state.modelTab];
  $('modelMetricLabel').textContent = metric.label;
  if (!m) return;

  const t = new Date(m.time);
  const isTomorrow = t.toDateString() !== new Date().toDateString();
  $('modelTime').textContent = `${isTomorrow ? 'Tomorrow' : 'Today'} · ${timeFmt(t)}`;

  const rows = [];
  for (const [label, key] of MODELS) {
    const col = Object.keys(m.data.hourly).find(k => k.startsWith(metric.field) && k.endsWith(key));
    if (!col) continue;
    const v = +m.data.hourly[col][m.ti];
    if (!Number.isFinite(v)) continue;
    rows.push({ label, v });
  }

  if (!rows.length) {
    $('modelRows').innerHTML = `<div class="event-meta">No model publishes ${metric.label.toLowerCase()} for this location and hour.</div>`;
    $('modelConsensus').textContent = '—';
    $('modelConsensusDesc').textContent = 'Our Best Estimate';
    $('agreementText').textContent = '—';
    $('agreementPct').textContent = '—';
    $('agreementRing').style.setProperty('--p', '0%');
    return;
  }

  rows.sort((a, b) => b.v - a.v);
  const vals = rows.map(r => r.v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const spread = hi - lo;

  /* bar widths: relative within the visible range, always readable */
  const width = v => state.modelTab === 'precipitation'
    ? clamp(v, 4, 100)
    : clamp(18 + (v - lo) / (hi - lo || 1) * 82, 18, 100);

  $('modelRows').innerHTML = rows.map(r => `
    <div class="model-row">
      <div class="model-name">${r.label}</div>
      <div class="model-track"><div class="model-fill" style="width:${width(r.v)}%"></div></div>
      <div class="model-value">${fmt(r.v, metric.dp)}${metric.unit}</div>
    </div>`).join('');

  $('modelConsensus').textContent = `${fmt(avg, metric.dp)}${metric.unit}`;
  $('modelConsensusDesc').textContent = 'Our Best Estimate';

  const agreement = Math.round(clamp(100 - (spread / metric.spread) * 100, 4, 99));
  const word = agreement >= 80 ? 'High' : agreement >= 55 ? 'Moderate' : 'Low';
  const cls  = agreement >= 80 ? 'high' : agreement >= 55 ? '' : 'low';
  $('agreementText').textContent = word;
  $('agreementText').className = 'agreement-word ' + cls;
  $('agreementPct').textContent = agreement + '%';
  const ring = $('agreementRing');
  ring.className = 'agreement-ring ' + cls;
  ring.style.setProperty('--p', agreement + '%');
}

/* ============================================================
   Radar map
   ============================================================ */

let map, radarLayer, cloudLayer, baseLayer;
const BASES = [
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
];

async function initRadar() {
  if (!Number.isFinite(state.lat) || !window.L) return;

  if (!map) {
    map = L.map('radarMap', { zoomControl: false, attributionControl: true }).setView([state.lat, state.lon], 7);
    baseLayer = L.tileLayer(BASES[0], {
      maxZoom: 18, subdomains: 'abcd',
      attribution: '© OpenStreetMap, © CARTO'
    }).addTo(map);
    L.circleMarker([state.lat, state.lon], {
      radius: 5, color: '#eaf3f8', weight: 2, fillColor: '#4a9fe0', fillOpacity: 1
    }).addTo(map);
  } else {
    map.setView([state.lat, state.lon], 7);
    setTimeout(() => map.invalidateSize(), 30);
  }

  try {
    const rv = await json('https://api.rainviewer.com/public/weather-maps.json');
    state.radar.host = rv.host;
    state.radar.frames = [...(rv.radar?.past || []), ...(rv.radar?.nowcast || [])];
    state.radar.satellite = (rv.satellite?.infrared || []).at(-1);
    const last = (rv.radar?.past || []).length - 1;
    state.radar.idx = Math.max(0, last);

    const range = $('radarRange');
    range.max = String(Math.max(0, state.radar.frames.length - 1));
    range.value = String(state.radar.idx);
    range.oninput = () => { stopRadar(); showFrame(+range.value); };

    showFrame(state.radar.idx);
    $('radarNote').textContent = 'Radar © RainViewer, personal and educational use. Base map © OpenStreetMap contributors, © CARTO.';
  } catch {
    $('radarNote').textContent = 'Radar tiles are temporarily unavailable. Forecast data remains live.';
  }
}

function showFrame(i) {
  const r = state.radar;
  if (!r.frames.length || !map) return;
  i = clamp(i, 0, r.frames.length - 1);
  r.idx = i;
  const f = r.frames[i];

  if (r.layers.radar) {
    const url = `${r.host}${f.path}/512/{z}/{x}/{y}/4/1_1.png`;
    if (radarLayer) map.removeLayer(radarLayer);
    radarLayer = L.tileLayer(url, { opacity: .70, zIndex: 4 }).addTo(map);
  }

  $('radarRange').value = String(i);
  const past = new Date(f.time * 1000);
  const isFuture = f.time * 1000 > Date.now();
  $('radarTime').textContent = isFuture ? `+${timeFmt(past)}` : timeFmt(past);
}

function stopRadar() {
  state.radar.playing = false;
  clearInterval(state.radar.timer);
  $('radarPlay').innerHTML = '<svg><use href="#i-play"/></svg>';
}

$('radarPlay').onclick = () => {
  const r = state.radar;
  if (r.playing) return stopRadar();
  if (!r.frames.length) return;
  r.playing = true;
  $('radarPlay').innerHTML = '<svg><use href="#i-pause"/></svg>';
  r.timer = setInterval(() => showFrame((r.idx + 1) % r.frames.length), 550);
};

qa('[data-layer]').forEach(b => b.onclick = () => {
  const kind = b.dataset.layer;
  const r = state.radar;

  if (kind === 'radar') {
    r.layers.radar = !r.layers.radar;
    b.classList.toggle('on', r.layers.radar);
    if (!r.layers.radar && radarLayer) { map.removeLayer(radarLayer); radarLayer = null; }
    else showFrame(r.idx);
  }

  if (kind === 'clouds') {
    r.layers.clouds = !r.layers.clouds;
    b.classList.toggle('on', r.layers.clouds);
    if (cloudLayer) { map.removeLayer(cloudLayer); cloudLayer = null; }
    if (r.layers.clouds && r.satellite) {
      cloudLayer = L.tileLayer(`${r.host}${r.satellite.path}/512/{z}/{x}/{y}/0/0_0.png`, { opacity: .55, zIndex: 3 }).addTo(map);
    }
  }

  if (kind === 'base') {
    r.layers.base = (r.layers.base + 1) % BASES.length;
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer(BASES[r.layers.base], {
      maxZoom: 18, subdomains: r.layers.base === 2 ? 'abc' : 'abcd',
      attribution: r.layers.base === 2 ? '© OpenStreetMap' : '© OpenStreetMap, © CARTO'
    }).addTo(map);
    baseLayer.setZIndex(1);
  }
});

/* ============================================================
   Boot
   ============================================================ */

function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  loadAstronomy();
  renderCalendar();
  renderAstronomy();

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('skylab-location')); } catch {}

  const start = pageFromHash();
  if (start) go(start);

  if (saved?.lat && saved?.lon) {
    setLocation(saved.lat, saved.lon, saved.name || 'Saved location');
  } else {
    $('locationModal').classList.add('open');
    syncHeader(state.page);
  }

  setInterval(() => { if (state.lat) refresh(); }, 10 * 60 * 1000);
  setInterval(() => { if (state.page === 'now' || state.page === 'space') syncHeader(state.page); }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.lat && Date.now() - (state.updatedAt || 0) > 5 * 60000) refresh();
  });
}

boot();
