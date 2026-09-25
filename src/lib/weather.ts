import "server-only";
import { db } from "./db";

/**
 * The weather line on the screensaver, and nothing else.
 *
 * Open-Meteo, because it needs no account, no key and no attribution: the
 * owner of a self-hosted app should not have to sign up to a third service to
 * see a temperature on a shelf. The request carries a latitude and a
 * longitude and nothing about anyone.
 *
 * The place is the instance's: `WEATHER_LATITUDE`, `WEATHER_LONGITUDE` and
 * `WEATHER_PLACE`, else the place the admin account chose in the current app
 * (its `screensaver*` columns came across with the database). A household
 * shares a window. With neither there is no weather line at all.
 *
 * Kept an hour in this process, per place and unit: the screensaver may sit
 * on a tablet for a fortnight, and the ceiling on requests matters more than
 * the last degree. A failure is kept for five minutes, so an unreachable API
 * is not asked again by every refresh, and it means no weather, never a
 * broken screensaver.
 */

const FORECAST = "https://api.open-meteo.com/v1/forecast";
export const WEATHER_LIFETIME_MS = 60 * 60 * 1000;
const FAILURE_LIFETIME_MS = 5 * 60 * 1000;

export type Weather = { temperature: number; unit: "C" | "F"; label: string };

/** The countries that still report the weather in Fahrenheit; everywhere else is Celsius. */
const FAHRENHEIT = new Set(["US", "BS", "BZ", "KY", "PW", "FM", "MH", "LR"]);

export function unitFor(region: string): "C" | "F" {
  return FAHRENHEIT.has(region) ? "F" : "C";
}

/**
 * WMO codes, which Open-Meteo answers in, cut down to the distinctions anyone
 * across a room can act on. Anything unrecognised reads as cloud, the safest
 * wrong answer.
 */
const CODES: Record<number, string> = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "showers", 81: "showers", 82: "heavy showers", 85: "snow showers", 86: "snow showers",
  95: "thunderstorms", 96: "thunderstorms", 99: "thunderstorms",
};

type Forecast = { current?: { temperature_2m?: number; weather_code?: number } };

type Entry = { until: number; value: Weather | null };
const g = globalThis as unknown as { trekkerWeather?: Map<string, Entry> };
const kept = (g.trekkerWeather ??= new Map<string, Entry>());

export type WeatherDeps = { fetcher?: typeof fetch; now?: () => number };

/** Current conditions at a point, from the hour's copy when there is one. */
export async function weatherAt(
  latitude: number,
  longitude: number,
  unit: "C" | "F",
  { fetcher = fetch, now = Date.now }: WeatherDeps = {},
): Promise<Weather | null> {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)},${unit}`;
  const hit = kept.get(key);
  if (hit && hit.until > now()) return hit.value;

  const url = new URL(FORECAST);
  url.searchParams.set("latitude", latitude.toFixed(4));
  url.searchParams.set("longitude", longitude.toFixed(4));
  url.searchParams.set("current", "temperature_2m,weather_code");
  if (unit === "F") url.searchParams.set("temperature_unit", "fahrenheit");

  const data = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(6000) })
    .then((res) => (res.ok ? (res.json() as Promise<Forecast>) : null))
    .catch(() => null);
  const temperature = data?.current?.temperature_2m;
  const value =
    typeof temperature === "number"
      ? { temperature: Math.round(temperature), unit, label: CODES[data?.current?.weather_code ?? 3] ?? CODES[3] }
      : null;
  kept.set(key, { until: now() + (value ? WEATHER_LIFETIME_MS : FAILURE_LIFETIME_MS), value });
  return value;
}

/** For tests: forget every kept answer. */
export function forgetWeather() {
  kept.clear();
}

export type Place = { name: string | null; latitude: number; longitude: number };

export async function instancePlace(): Promise<Place | null> {
  const lat = Number(process.env.WEATHER_LATITUDE);
  const lon = Number(process.env.WEATHER_LONGITUDE);
  if (process.env.WEATHER_LATITUDE?.trim() && process.env.WEATHER_LONGITUDE?.trim() && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { name: process.env.WEATHER_PLACE?.trim() || null, latitude: lat, longitude: lon };
  }
  const admin = await db.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { screensaverPlace: true, screensaverLat: true, screensaverLon: true },
  });
  if (admin?.screensaverLat == null || admin.screensaverLon == null) return null;
  return { name: admin.screensaverPlace, latitude: admin.screensaverLat, longitude: admin.screensaverLon };
}

/** "Utrecht 14° and clear", or null when there is no place or no answer. */
export async function weatherLine(region: string, deps?: WeatherDeps): Promise<string | null> {
  const place = await instancePlace();
  if (!place) return null;
  const w = await weatherAt(place.latitude, place.longitude, unitFor(region), deps);
  if (!w) return null;
  const degrees = `${w.temperature}°${w.unit === "F" ? "F" : ""}`;
  return [place.name, `${degrees} and ${w.label}`].filter(Boolean).join(" ");
}
