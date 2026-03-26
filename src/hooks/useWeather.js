import { useState, useEffect } from 'react'

// Open-Meteo — sin API key, A Coruña
const URL = 'https://api.open-meteo.com/v1/forecast?latitude=43.37135&longitude=-8.396&current=temperature_2m,weathercode,windspeed_10m&wind_speed_unit=kmh&timezone=Europe%2FMadrid'

const WMO = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

export function useWeather() {
  const [weather, setWeather] = useState(null)

  useEffect(() => {
    fetch(URL)
      .then(r => r.json())
      .then(d => setWeather({
        temp: Math.round(d.current.temperature_2m),
        icon: WMO[d.current.weathercode] ?? '🌡️',
        wind: Math.round(d.current.windspeed_10m),
      }))
      .catch(console.error)

    const id = setInterval(() => {
      fetch(URL)
        .then(r => r.json())
        .then(d => setWeather({
          temp: Math.round(d.current.temperature_2m),
          icon: WMO[d.current.weathercode] ?? '🌡️',
          wind: Math.round(d.current.windspeed_10m),
        }))
        .catch(console.error)
    }, 10 * 60 * 1000)

    return () => clearInterval(id)
  }, [])

  return weather
}
