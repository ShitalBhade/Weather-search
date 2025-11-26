# Weather Search — Local Project

A small local web service + frontend that lets users search current weather by city name.
This project proxies requests to OpenWeatherMap's Current Weather API and implements a simple in-memory LRU cache.

**Vendor API used:** OpenWeatherMap Current Weather API — https://openweathermap.org/current

## Features
- Search current weather by city name (`GET /api/weather?city=CityName`)
- Caching (LRU) with TTL and max entries
- Simple, responsive frontend (served from `public/`)
- Returns vendor raw response plus extracted, user-friendly attributes (temperature, humidity, wind, sunrise/sunset, icon, etc.)

## How to run locally

1. Clone or extract the project.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Provide your OpenWeatherMap API key:
   - Copy `.env.example` to `.env` and set `OPENWEATHERMAP_API_KEY`.
4. Start the server:
   ```bash
   npm start
   ```
5. Open your browser to: `http://localhost:3000`

## API

- `GET /api/weather?city=CityName`
  - Response JSON:
    ```json
    {
      "cached": false,
      "fetched_at": "2025-11-26T...",
      "data": {
        "city": "London",
        "country": "GB",
        "coords": { "lon": -0.13, "lat": 51.51 },
        "temperature_c": 12.3,
        "feels_like_c": 10.8,
        "weather_main": "Clouds",
        "weather_description": "broken clouds",
        "icon": "https://openweathermap.org/img/wn/04d@2x.png",
        "vendor_raw": { ... } 
      }
    }
    ```

- `GET /api/health` — simple health + cache stats.

## Caching details

- In-memory LRU cache.
- Configurable via `.env`:
  - `CACHE_TTL_SECONDS` (default 600)
  - `CACHE_MAX_ENTRIES` (default 200)
- When cache reaches max entries, the least-recently-used item is evicted.

## Notes / Next steps (if you extend this)
- Add persistent cache using Redis for multi-process setups.
- Add rate-limiting and better error handling for vendor API quota issues.
- Add unit tests.

## License
MIT
