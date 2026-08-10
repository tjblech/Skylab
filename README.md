# SKYLAB

A dark-first, iPhone-first live Earth + sky conditions PWA.

## Run / deploy
Serve this folder over HTTPS (GitHub Pages, Cloudflare Pages, Vercel, etc.). Geolocation and PWA installation require HTTPS outside localhost.

No paid account or API key is required for the core app. NASA DONKI uses the public `DEMO_KEY` for supplemental solar-event context; the app gracefully falls back to NOAA if that quota is unavailable.

## Live sources
- Open-Meteo: weather, model comparison, air quality / UV
- NOAA / NWS: U.S. alerts
- NOAA SWPC: Kp, solar wind, IMF Bz/Bt, GOES X-ray flux, NOAA scales
- NASA DONKI: supplemental recent flare/CME context
- RainViewer: radar tiles for personal/educational use
- Astronomy Engine: local Sun/Moon/planet/eclipses calculations

## Current V1
- Now briefing with translated weather + AQI + UV + alerts
- Tonight sky score, best viewing window, Moon/planet visibility, aurora heuristic
- Detailed weather + 10-day + atmospheric diagnostics
- Individual-model comparison (ECMWF/GFS/ICON)
- Live radar
- Space weather dashboard + X-ray graph + events + NOAA scales
- Unified local sky calendar
- Location presets + current device location
- Offline shell / installable PWA

## Next logical additions
Forecast-change tracking, notifications, full-map layer switcher, richer meteor-shower data, satellite/ISS passes, light-pollution data, and saved locations.
