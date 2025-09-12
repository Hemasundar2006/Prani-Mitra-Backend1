const fetch = require('node-fetch');

class WeatherService {
  constructor() {
    this.meteoBase = 'https://api.open-meteo.com/v1/forecast';
    this.geoBase = 'https://geocoding-api.open-meteo.com/v1/search';
  }

  // Geocode using Open-Meteo geocoding (name search). Works with pincode, district, or state text
  async geocode(query, { count = 1 } = {}) {
    const url = `${this.geoBase}?name=${encodeURIComponent(query)}&count=${count}&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error('No geocoding results');
    const best = data.results[0];
    return { lat: best.latitude, lon: best.longitude, name: best.name, state: best.admin1, country: best.country_code };
  }

  async getCurrentAndHourlyByCoords(lat, lon) {
    // Current + hourly variables: temperature, humidity, wind speed
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'temperature_2m,wind_speed_10m,relative_humidity_2m',
      hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m',
      timezone: 'auto'
    });
    const url = `${this.meteoBase}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
    const data = await res.json();
    return this.#mapMeteoResponse(data);
  }

  #mapMeteoResponse(data) {
    return {
      location: {
        lat: data.latitude,
        lon: data.longitude,
        timezone: data.timezone
      },
      current: {
        time: data.current?.time,
        temperature_2m: data.current?.temperature_2m,
        wind_speed_10m: data.current?.wind_speed_10m,
        relative_humidity_2m: data.current?.relative_humidity_2m
      },
      hourly: {
        time: data.hourly?.time,
        temperature_2m: data.hourly?.temperature_2m,
        relative_humidity_2m: data.hourly?.relative_humidity_2m,
        wind_speed_10m: data.hourly?.wind_speed_10m
      }
    };
  }
}

module.exports = new WeatherService();


