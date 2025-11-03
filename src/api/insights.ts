const API = "https://pywork-production.up.railway.app"; //process.env.EXPO_PUBLIC_API_BASE || "http://localhost:8080";

//const API = process.env.EXPO_PUBLIC_API_BASE || "http://localhost:8080";

export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  process.env.REACT_APP_API_BASE ||
  "https://pywork-production.up.railway.app";
  //"http://localhost:8080";

/*export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  process.env.REACT_APP_API_BASE ||
  "http://localhost:8080";
*/

type Summary = {
  timeframe: string;
  updated_at: string;
  breadth: { advancers: number; decliners: number; unchanged: number };
  volume: { total: number; up: number; down: number };
  trend: { bias: "up" | "down" | "sideways"; strength: number };
  // optional extras used by the UI (safe if server doesn't send them)
  thrust?: number;
  vola?: {
    SPY?: { atr_pct: number | null; hv20: number | null };
    QQQ?: { atr_pct: number | null; hv20: number | null };
    IWM?: { atr_pct: number | null; hv20: number | null };
  };
  smas?: { SPY?: { sma20: number | null; sma50: number | null } };
  meta?: { session?: "PRE" | "REG" | "POST" | "CLOSED"; data_source?: "live" | "cache"; tf?: string; asof?: string };
  note?: string;
};

type Sentiment = {
  put_call_vol_ratio: number | null;
  put_call_oi_ratio: number | null;
  dark_pool_score?: number;
  news_sentiment?: { score: number; sample: number };
  atm_iv_mid?: Record<string, number | null>;
  options_uoa: {
    symbol: string;
    side: "CALL" | "PUT";
    ratio: number;
    note?: string;
    occ?: string;
    vol?: number;
    oi?: number;
    strike?: number;
    exp?: string;
  }[];
  meta?: { session?: "PRE" | "REG" | "POST" | "CLOSED"; data_source?: "live" | "cache"; asof?: string };
};

type PatternItem = { symbol: string; type: string; confidence: number };
type Patterns = { timeframe: string; patterns: PatternItem[] };

// --- tiny fetch wrapper with timeout + helpful errors ---
async function request<T>(path: string, query?: Record<string, string>): Promise<T> {
  const u = new URL(path.replace(/^\//, ""), API_BASE.endsWith("/") ? API_BASE : API_BASE + "/");
  if (query) Object.entries(query).forEach(([k, v]) => u.searchParams.set(k, v));
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);

  try {
    const res = await fetch(u.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: ctl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} on ${u.pathname}${u.search}${text ? ` — ${text.slice(0, 180)}` : ""}`);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Request timed out");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// --- exported API used by the screen ---
export const getSummary = (tf: string = "daily") =>
  request<Summary>("/api/insights/summary", { tf });

export const getSentiment = () =>
  request<Sentiment>("/api/insights/sentiment");

export const getPatterns = (tf: string = "5m") =>
  request<Patterns>("/api/insights/patterns", { tf });

// Optional: export the types for component props/intellisense
export type { Summary, Sentiment, Patterns, PatternItem };

/*
export async function getSummary(tf: string) {
  const r = await fetch(`${API}/api/insights/summary?tf=${encodeURIComponent(tf)}`);
  if (!r.ok) throw new Error(`summary ${r.status}`);
  return r.json();
}

export async function getSentiment() {
  const r = await fetch(`${API}/api/insights/sentiment`);
  if (!r.ok) throw new Error(`sentiment ${r.status}`);
  return r.json();
}

export async function getPatterns(tf: string) {
  const r = await fetch(`${API}/api/insights/patterns?tf=${encodeURIComponent(tf)}`);
  if (!r.ok) throw new Error(`patterns ${r.status}`);
  return r.json();
}
*/
