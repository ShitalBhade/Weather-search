/**
 * Weather Search - Express backend
 * - Proxies requests to OpenWeatherMap Current Weather API
 * - Implements a simple in-memory LRU cache with TTL (expiry) and max entries
 *
 * Requirements:
 *  - Set OPENWEATHERMAP_API_KEY in environment or .env
 *  - npm install
 *  - npm start
 *
 * API:
 *  GET /api/weather?city=CityName
 *    - returns JSON with vendor response + selected interesting attributes
 *
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

dotenv.config();

const API_KEY = process.env.OPENWEATHERMAP_API_KEY;
if (!API_KEY) {
  console.warn("WARNING: OPENWEATHERMAP_API_KEY not set. Requests to vendor API will fail until you set it.");
}

const PORT = process.env.PORT || 3000;
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || "600"); // default 10 min
const CACHE_MAX_ENTRIES = parseInt(process.env.CACHE_MAX_ENTRIES || "200");

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use('/', express.static('public'));

// Simple LRU cache with TTL
class LRUCache {
  constructor(maxEntries = 200, ttlSeconds = 600) {
    this.maxEntries = maxEntries;
    this.ttlMillis = ttlSeconds * 1000;
    this.map = new Map(); // key -> {value, expiry}
  }

  _isExpired(entry) {
    return Date.now() > entry.expiry;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (this._isExpired(entry)) {
      this.map.delete(key);
      return null;
    }
    // refresh LRU ordering: delete and re-set
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    // evict if needed
    if (this.map.size >= this.maxEntries) {
      // delete least-recently used (first item)
      const firstKey = this.map.keys().next().value;
      if (firstKey) this.map.delete(firstKey);
    }
    const entry = { value, expiry: Date.now() + this.ttlMillis };
    // ensure we remove existing to update insertion order
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, entry);
  }

  stats() {
    return {
      entries: this.map.size,
      maxEntries: this.maxEntries,
      ttlMillis: this.ttlMillis
    };
  }
}

const cache = new LRUCache(CACHE_MAX_ENTRIES, CACHE_TTL_SECONDS);

function buildOpenWeatherUrl(city) {
  const base = 'https://api.openweathermap.org/data/2.5/weather';
  const params = new URLSearchParams({
    q: city,
    appid: API_KEY || '',
    units: 'metric'
  });
  return `${base}?${params.toString()}`;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', now: new Date().toISOString(), cache: cache.stats() });
});

/**
 * GET /api/weather?city=CityName
 * Returns:
 *  - vendor: raw vendor response
 *  - extracted: interesting attributes
 *  - fetched_at, cached
 */
app.get('/api/weather', async (req, res) => {
  const city = (req.query.city || '').trim();
  if (!city) {
    return res.status(400).json({ error: "Missing required query parameter 'city'." });
  }

  const key = city.toLowerCase();

  const cached = cache.get(key);
  if (cached) {
    return res.json({ cached: true, fetched_at: new Date().toISOString(), data: cached });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: "Server not configured with OPENWEATHERMAP_API_KEY. See README." });
  }

  const url = buildOpenWeatherUrl(city);
  try {
    const r = await fetch(url);
    if (r.status === 404) {
      return res.status(404).json({ error: `City '${city}' not found by vendor.` });
    }
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: "Vendor API error", status: r.status, body: text });
    }
    const vendor = await r.json();

    // Build useful attributes
    const extracted = {
      city: vendor.name,
      country: vendor.sys && vendor.sys.country,
      coords: vendor.coord,
      timezone_seconds: vendor.timezone,
      weather_main: vendor.weather && vendor.weather.length ? vendor.weather[0].main : undefined,
      weather_description: vendor.weather && vendor.weather.length ? vendor.weather[0].description : undefined,
      icon: vendor.weather && vendor.weather.length ? `https://openweathermap.org/img/wn/${vendor.weather[0].icon}@2x.png` : undefined,
      temperature_c: vendor.main && vendor.main.temp,
      feels_like_c: vendor.main && vendor.main.feels_like,
      temp_min_c: vendor.main && vendor.main.temp_min,
      temp_max_c: vendor.main && vendor.main.temp_max,
      pressure_hpa: vendor.main && vendor.main.pressure,
      humidity_percent: vendor.main && vendor.main.humidity,
      wind_speed_mps: vendor.wind && vendor.wind.speed,
      wind_deg: vendor.wind && vendor.wind.deg,
      sunrise_utc: vendor.sys && vendor.sys.sunrise ? new Date((vendor.sys.sunrise + (vendor.timezone || 0)) * 1000).toISOString() : undefined,
      sunset_utc: vendor.sys && vendor.sys.sunset ? new Date((vendor.sys.sunset + (vendor.timezone || 0)) * 1000).toISOString() : undefined,
      vendor_raw: vendor
    };

    // Save to cache
    cache.set(key, extracted);

    return res.json({ cached: false, fetched_at: new Date().toISOString(), data: extracted });
  } catch (err) {
    console.error("Error fetching vendor API:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req,res) => {
  res.sendFile(require('path').resolve(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Weather Search server listening on http://localhost:${PORT}`);
  console.log(`Cache TTL seconds: ${CACHE_TTL_SECONDS}, max entries: ${CACHE_MAX_ENTRIES}`);
});
