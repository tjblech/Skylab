# SKYLAB

Live conditions. Above and around you.

A dark-first, iPhone-first PWA for weather, space weather, astronomy and air quality.
The UI is built against `SKYLAB-preview-reference.png` — type scale, spacing, colour and
artwork are matched to it — while every number on screen comes from a live source.

---

## Run it

**Local server** (recommended — geolocation, service worker and PWA install all work):

```bash
cd skylab-pwa
python3 -m http.server 8777
# open http://127.0.0.1:8777
```

**Deploy** — serve the folder over HTTPS (GitHub Pages, Cloudflare Pages, Vercel, Netlify).

Opening `index.html` straight off disk works too, but `file://` blocks geolocation and the
service worker, so use a location preset.

No paid account or API key is required.

---

## Design target

The whole UI is laid out for a **393 CSS px** canvas (iPhone width) and centred at up to
430 px on wider screens. Sizes were measured off the reference rather than guessed:

| Element | Size |
|---|---|
| Screen title | 25px / 700 |
| Screen subtitle | 14.5px |
| Hero temperature | 88px / 250, degree 34px |
| Condition | 21px |
| Metric value / label | 19px / 13.5px |
| Card label | 15px, sentence case |
| Section title | 18px / 600 |
| Status value | 23px |
| Nav icon / label | 23px / 10.5px |
| Gutter | 20px |
| Card radius | 16px |

---

## Screens

| Screen | Nav tab | Notes |
|---|---|---|
| **Now** | Now | Hero, 3-up metrics, briefing, 4-up status grid, three feature cards |
| **Tonight** | Tonight | Verdict, four sky scores, best-window histogram, Worth Seeing, aurora |
| **Weather** | Weather | Hero + moon, H/L strip, rain card, hourly, 10-day, atmospheric detail |
| **Space Weather** | Space | Kp histogram, solar wind / IMF grid, flares, sunspots, radiation storm |
| **Astronomy** | Calendar → detail | Moon card, Planets Tonight, Other Highlights |
| **Map** | Weather → detail | Radar, layer toggles, intensity legend, animated scrubber |
| **Model Comparison** | Weather → detail | Four metric tabs, per-model bars, consensus, agreement ring |
| **Calendar** | Calendar | Week strip and a computed sky calendar |

Every screen is addressable by hash — `index.html#tonight`, `#astronomy`, `#models` — which
makes deep links and screenshots easy.

---

## Live sources

- **Open-Meteo** — weather, individual models, air quality, UV
- **NOAA / NWS** — U.S. alerts, place-name resolution
- **NOAA SWPC** — Kp, GOES X-ray flux, sunspots, NOAA scales, and solar wind via the
  **RTSW** feeds (`rtsw_wind_1m` / `rtsw_mag_1m`). The older
  `/products/solar-wind/*` endpoints no longer respond and have been replaced.
- **NASA DONKI** — supplemental flare / CME context
- **RainViewer** — radar and infrared satellite tiles (personal / educational use)
- **CARTO + OpenStreetMap** — dark base map
- **Astronomy Engine** — Sun / Moon / planet / eclipse / twilight maths, on-device
- **Celestrak + satellite.js** — ISS passes, loaded lazily as progressive enhancement

Feed parsing is defensive: SWPC serves some endpoints as `[header, ...rows]` and others as
`[{…}]`, so `lastValid()` handles both and walks backwards past null-padded records.

---

## Where this differs from the preview

1. **Model Comparison** lists HRRR, ECMWF, ICON, GFS and **GEM**. The preview's fifth row
   is NAM, which Open-Meteo does not publish; GEM is the closest equivalent and keeps the
   five-row layout identical.
2. **The numbers are live.** The preview is a fixed May 2025 Boston snapshot.
3. **Forecast Change** is not built (you deferred it). It needs forecast snapshots in
   `localStorage` to diff against — a self-contained addition whenever you want it.

---

## Files

```
index.html   markup for all 8 screens + inline SVG icon sprite
app.css      design system: tokens, components, screens (no framework)
app.js       state, data loading, derived metrics, renderers, navigation
sw.js        offline shell; never caches live API traffic
_frame.html  dev harness — renders the app in a 393px iframe for screenshots
             (open _frame.html?p=tonight). Safe to delete before shipping.
assets/      artwork
```

Current artwork: `card-tonight`, `card-space`, `card-event`, `panel-tonight`,
`panel-space`, `saturn-obj`, `moon-obj`, `meteor-obj`, `iss-obj`, `sky-obj`,
`moon-photo`, `saturn-photo`, `crescent`, `mark`, `earth-horizon`, `icon-192`, `icon-512`.
Older `*-hi.png` / `art-*.svg` / `preview-*.png` files from the first build are unused and
can be deleted.

---

## Possible next steps

Forecast-change tracking, push notifications, richer meteor-shower radiant data, a
light-pollution overlay, saved locations, and widget export.
