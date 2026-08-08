import "server-only";
import { watchRegion } from "./region";

/**
 * Weather, for the screensaver and nothing else.
 *
 * Open-Meteo, because it is the only usable forecast API that needs no account,
 * no key and no attribution — which matters for a self-hosted app whose owner
 * should not have to sign up to a third service to see a temperature on a shelf
 * tablet. Nothing about the user leaves this machine: the request carries a
 * latitude and a longitude and nothing else, no identifier of any kind, and it
 * is only ever made for someone who typed a place into their settings.
 *
 * Everything fails soft. No location, an unreachable API, a shape we did not
 * expect — all of them mean "no weather panel", never a broken screensaver.
 */

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * The coarse kind of weather it is, for choosing a glyph.
 *
 * Separate from the label on purpose: the label is prose and belongs to this
 * module, the glyph is a lucide component and belongs to the client. Handing
 * over one of eight words rather than the raw WMO number keeps the mapping in
 * one place without dragging the whole code table into the browser.
 */
export type WeatherKind =
  | "clear"
  | "part-cloud"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm";

export type Weather = {
  /** As the user named it — "Utrecht", not "Utrecht, Provincie Utrecht, NL". */
  place: string;
  /** Whole degrees. A screensaver has no use for a decimal. */
  temperature: number;
  feelsLike: number;
  high: number;
  low: number;
  /** "C" or "F", so the panel can print the unit it was actually given. */
  unit: "C" | "F";
  label: string;
  kind: WeatherKind;
  /** Open-Meteo's own idea of it, which follows the local sunrise. */
  isDay: boolean;
};

/**
 * Which unit to ask for.
 *
 * Taken from the viewer's region — their own setting where they made one,
 * `WATCH_REGION` otherwise — because a second question about where this person
 * is would be a second question with the same answer. The list is every
 * country that still reports the weather in Fahrenheit; everywhere else, and an
 * unset region, gets Celsius.
 */
const FAHRENHEIT = new Set(["US", "BS", "BZ", "KY", "PW", "FM", "MH"]);

function unit(region: string = watchRegion()): "C" | "F" {
  return FAHRENHEIT.has(region) ? "F" : "C";
}

/**
 * WMO weather interpretation codes, which is what Open-Meteo answers in.
 *
 * The full table has twenty-eight entries, most of them distinctions nobody
 * standing across a room can act on — "slight" versus "moderate" rain reads the
 * same from the sofa. These are the ones worth telling apart, and anything
 * unrecognised falls through to the cloud, which is the safest wrong answer.
 */
const CODES: Record<number, { label: string; kind: WeatherKind }> = {
  0: { label: "Clear", kind: "clear" },
  1: { label: "Mostly clear", kind: "clear" },
  2: { label: "Partly cloudy", kind: "part-cloud" },
  3: { label: "Overcast", kind: "cloud" },
  45: { label: "Fog", kind: "fog" },
  48: { label: "Freezing fog", kind: "fog" },
  51: { label: "Light drizzle", kind: "drizzle" },
  53: { label: "Drizzle", kind: "drizzle" },
  55: { label: "Heavy drizzle", kind: "drizzle" },
  56: { label: "Freezing drizzle", kind: "drizzle" },
  57: { label: "Freezing drizzle", kind: "drizzle" },
  61: { label: "Light rain", kind: "rain" },
  63: { label: "Rain", kind: "rain" },
  65: { label: "Heavy rain", kind: "rain" },
  66: { label: "Freezing rain", kind: "rain" },
  67: { label: "Freezing rain", kind: "rain" },
  71: { label: "Light snow", kind: "snow" },
  73: { label: "Snow", kind: "snow" },
  75: { label: "Heavy snow", kind: "snow" },
  77: { label: "Snow grains", kind: "snow" },
  80: { label: "Showers", kind: "rain" },
  81: { label: "Showers", kind: "rain" },
  82: { label: "Heavy showers", kind: "rain" },
  85: { label: "Snow showers", kind: "snow" },
  86: { label: "Snow showers", kind: "snow" },
  95: { label: "Thunderstorm", kind: "storm" },
  96: { label: "Thunderstorm", kind: "storm" },
  99: { label: "Thunderstorm", kind: "storm" },
};

type Forecast = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    weather_code?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
};

/**
 * Current conditions at a point.
 *
 * Cached for fifteen minutes, which is roughly how often Open-Meteo's own
 * current-conditions block moves. The screensaver may sit on one machine for a
 * fortnight, so the ceiling on requests matters more here than the freshness of
 * the last degree.
 */
export async function getWeather(
  latitude: number,
  longitude: number,
  place: string,
  region?: string,
): Promise<Weather | null> {
  const scale = unit(region);

  const url = new URL(FORECAST);
  url.searchParams.set("latitude", latitude.toFixed(4));
  url.searchParams.set("longitude", longitude.toFixed(4));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,is_day,weather_code",
  );
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("forecast_days", "1");
  if (scale === "F") url.searchParams.set("temperature_unit", "fahrenheit");
  // Without this the daily high and low are cut at UTC midnight, which in the
  // evening hands back tomorrow's figures for somewhere east of Greenwich.
  url.searchParams.set("timezone", "auto");

  const data = await fetch(url, {
    next: { revalidate: 60 * 15 },
    signal: AbortSignal.timeout(6000),
  })
    .then((res) => (res.ok ? (res.json() as Promise<Forecast>) : null))
    .catch(() => null);

  const current = data?.current;
  if (!data || typeof current?.temperature_2m !== "number") return null;

  const code = CODES[current.weather_code ?? 3] ?? CODES[3];

  return {
    place,
    temperature: Math.round(current.temperature_2m),
    feelsLike: Math.round(current.apparent_temperature ?? current.temperature_2m),
    high: Math.round(data.daily?.temperature_2m_max?.[0] ?? current.temperature_2m),
    low: Math.round(data.daily?.temperature_2m_min?.[0] ?? current.temperature_2m),
    unit: scale,
    label: code.label,
    kind: code.kind,
    isDay: current.is_day !== 0,
  };
}

export type Place = {
  name: string;
  /** "Provincie Utrecht, Netherlands" — enough to tell two Springfields apart. */
  detail: string;
  latitude: number;
  longitude: number;
};

/**
 * Turns a typed place name into coordinates, once, when it is chosen.
 *
 * The result is stored on the account, so nothing has to be looked up again
 * while the screensaver runs — and a village whose name Open-Meteo has never
 * heard of fails at the moment somebody is looking at the settings page, which
 * is the only moment there is anywhere to say so.
 */
export async function searchPlaces(query: string): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = new URL(GEOCODE);
  url.searchParams.set("name", trimmed);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  type Result = {
    name?: string;
    country?: string;
    admin1?: string;
    latitude?: number;
    longitude?: number;
  };

  const data = await fetch(url, {
    next: { revalidate: 60 * 60 * 24 },
    signal: AbortSignal.timeout(6000),
  })
    .then((res) => (res.ok ? (res.json() as Promise<{ results?: Result[] }>) : null))
    .catch(() => null);

  return (data?.results ?? [])
    .filter(
      (r): r is Result & { name: string; latitude: number; longitude: number } =>
        typeof r.name === "string" &&
        typeof r.latitude === "number" &&
        typeof r.longitude === "number",
    )
    .map((r) => ({
      name: r.name,
      detail: [r.admin1, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
    }));
}
