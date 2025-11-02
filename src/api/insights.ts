const API = process.env.EXPO_PUBLIC_API_BASE || "http://localhost:8080";

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
