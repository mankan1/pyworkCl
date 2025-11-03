// src/screens/InsightsScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { getSummary, getSentiment, getPatterns } from "../api/insights";

/* ---------- Types (match what your server returns) ---------- */

type Summary = {
  timeframe: string;
  updated_at: string;
  breadth: { advancers: number; decliners: number; unchanged: number };
  volume: { total: number; up: number; down: number };
  trend: { bias: "up" | "down" | "sideways"; strength: number };
  // new optional fields
  thrust?: number; // 0..1 (up-volume share)
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
  dark_pool_score?: number; // 0..1
  news_sentiment?: { score: number; sample: number };
  atm_iv_mid?: Record<string, number | null>; // { SPY: 0.22, ... }
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

/* ---------- Screen ---------- */

export default function InsightsScreen() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [patterns, setPatterns] = useState<Patterns | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const [s, sen, p] = await Promise.all([
        getSummary("daily"),
        getSentiment(),
        getPatterns("5m"),
      ]);
      setSummary(s);
      setSentiment(sen);
      setPatterns(p);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load insights");
      setSummary(null);
      setSentiment(null);
      setPatterns(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updatedText = useMemo(() => {
    const iso = summary?.updated_at || sentiment?.meta?.asof;
    if (!iso) return "";
    const d = new Date(iso);
    return `Updated ${d.toLocaleString()}`;
  }, [summary?.updated_at, sentiment?.meta?.asof]);

  const mode = (summary as any)?.meta ?? (sentiment as any)?.meta;
  const sessionClosed = mode?.session === "CLOSED";
  const usingCache = mode?.data_source === "cache";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <Text style={styles.title}>Insights</Text>
        {!!updatedText && <Text style={styles.updated}>{updatedText}</Text>}

        {(sessionClosed || usingCache) && (
          <Banner
            type="info"
            text={
              sessionClosed
                ? "Market closed — showing last snapshot"
                : "Showing cached snapshot until live data is available"
            }
          />
        )}

        {err && (
          <Banner type="error" text={err} />
        )}

        {loading && !summary && !sentiment && !patterns ? (
          <View style={{ paddingTop: 32, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: "#9aa4b2", marginTop: 8 }}>Loading…</Text>
          </View>
        ) : null}

        {/* SUMMARY CARD */}
        {summary && (
          <Card title="Summary" subtitle={summary.timeframe?.toUpperCase?.() || ""}>
            <Row>
              <Col style={{ flex: 1 }}>
                <Label>Market Breadth</Label>
                <BreadthBar
                  advancers={summary.breadth.advancers}
                  decliners={summary.breadth.decliners}
                  unchanged={summary.breadth.unchanged}
                />
                <Tiny>
                  A:{summary.breadth.advancers} · D:{summary.breadth.decliners} · U:{summary.breadth.unchanged}
                </Tiny>
              </Col>
              <Col style={{ width: 12 }} />
              <Col style={{ flex: 1 }}>
                <Label>Volume</Label>
                <VolumeBar up={summary.volume.up} down={summary.volume.down} total={summary.volume.total} />
                <Tiny>
                  Up {fmtNum(summary.volume.up)} · Down {fmtNum(summary.volume.down)} · Total {fmtNum(summary.volume.total)}
                </Tiny>
              </Col>
            </Row>

            <Spacer size={12} />

            <Row style={{ alignItems: "center" }}>
              <Col>
                <Label>Trend</Label>
                <TrendBadge bias={summary.trend.bias} strength={safe01(summary.trend.strength)} />
              </Col>
              <Col style={{ flex: 1 }} />
              <Col>
                <Label>Volatility Snapshot</Label>
                {!!summary.vola ? (
                  <Wrap>
                    {["SPY", "QQQ", "IWM"].map((sym) => {
                      const v = (summary.vola as any)[sym];
                      if (!v) return null;
                      const atrp = isNum(v.atr_pct) ? `${round1(v.atr_pct * 100)}% ATR` : "ATR –";
                      const hv = isNum(v.hv20) ? `${round1(v.hv20 * 100)}% HV20` : "HV20 –";
                      return <Chip key={sym} tone="neutral" text={`${sym} ${atrp} · ${hv}`} />;
                    })}
                  </Wrap>
                ) : (
                  <Tiny style={{ opacity: 0.7 }}>—</Tiny>
                )}
              </Col>
            </Row>

            {/* Thrust (Up-volume share) */}
            {isNum(summary.thrust) && (
              <>
                <Spacer size={10} />
                <Row>
                  <Stat
                    label="Thrust (Up Vol)"
                    value={pct(safe01(summary.thrust))}
                    tone={summary.thrust! > 0.55 ? "good" : summary.thrust! < 0.45 ? "warn" : "neutral"}
                  />
                  <View style={{ flex: 1 }} />
                </Row>
              </>
            )}

            {!!summary.note && (
              <>
                <Spacer size={10} />
                <Tiny style={{ opacity: 0.7 }}>{summary.note}</Tiny>
              </>
            )}
          </Card>
        )}

        {/* SENTIMENT CARD */}
        {sentiment && (
          <Card title="Sentiment">
            <Row>
              <Stat
                label="Put/Call (Vol)"
                value={isNum(sentiment.put_call_vol_ratio) ? fmtFloat(sentiment.put_call_vol_ratio, 2) : "–"}
                tone={isNum(sentiment.put_call_vol_ratio) ? pcTone(sentiment.put_call_vol_ratio!) : "neutral"}
              />
              <Stat
                label="Put/Call (OI)"
                value={isNum(sentiment.put_call_oi_ratio) ? fmtFloat(sentiment.put_call_oi_ratio, 2) : "–"}
                tone={isNum(sentiment.put_call_oi_ratio) ? pcTone(sentiment.put_call_oi_ratio!) : "neutral"}
              />
              <Stat
                label="Dark Pool"
                value={isNum(sentiment.dark_pool_score) ? pct(safe01(sentiment.dark_pool_score!)) : "–"}
              />
              <Stat
                label="News"
                value={
                  sentiment.news_sentiment
                    ? `${sign(sentiment.news_sentiment.score)}${Math.abs(sentiment.news_sentiment.score).toFixed(2)} (${sentiment.news_sentiment.sample})`
                    : "–"
                }
              />
            </Row>

            {!!sentiment.atm_iv_mid && Object.keys(sentiment.atm_iv_mid).length > 0 && (
              <>
                <Spacer size={10} />
                <Label>ATM IV (nearest)</Label>
                <Wrap>
                  {Object.entries(sentiment.atm_iv_mid).map(([sym, iv]) => (
                    <Chip
                      key={sym}
                      tone="muted"
                      text={`${sym} ${isNum(iv) ? `${round1((iv as number) * 100)}%` : "–"}`}
                    />
                  ))}
                </Wrap>
              </>
            )}

            {/* UOA list */}
            {sentiment.options_uoa?.length ? (
              <>
                <Spacer size={10} />
                <Label>Unusual Options Activity</Label>
                <List>
                  {sentiment.options_uoa.map((u, i) => (
                    <ListItem key={`${u.symbol}-${i}`}>
                      <Wrap>
                        <Chip tone={u.side === "CALL" ? "good" : "warn"} text={`${u.symbol} ${u.side}`} />
                        {isNum(u.ratio) && <Chip text={`ratio ${round1(u.ratio)}`} />}
                        {u.strike && u.exp && <Chip tone="muted" text={`${u.strike} ${u.exp}`} />}
                        {u.note ? <Chip tone="muted" text={u.note} /> : null}
                      </Wrap>
                    </ListItem>
                  ))}
                </List>
              </>
            ) : null}
          </Card>
        )}

        {/* PATTERNS CARD */}
        {patterns && (
          <Card title="Patterns" subtitle={`${patterns.timeframe?.toUpperCase?.() || ""} scans`}>
            {patterns.patterns?.length ? (
              <List>
                {patterns.patterns.map((p) => (
                  <ListItem key={`${p.symbol}-${p.type}`}>
                    <Row style={{ alignItems: "center" }}>
                      <Text style={styles.symbol}>{p.symbol}</Text>
                      <Chip tone="muted" text={p.type} />
                      <View style={{ flex: 1 }} />
                      <ConfidenceBar confidence={safe01(p.confidence)} />
                    </Row>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Tiny style={{ opacity: 0.7 }}>No patterns</Tiny>
            )}
          </Card>
        )}

        {!loading && !summary && !sentiment && !patterns && (
          <Text style={{ opacity: 0.6, textAlign: "center", marginTop: 24 }}>No data yet. Pull to refresh.</Text>
        )}

        <Spacer size={28} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Small UI Primitives ---------- */

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Row style={{ alignItems: "baseline" }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.cardSubtitle}> · {subtitle}</Text>}
      </Row>
      <Spacer size={10} />
      {children}
    </View>
  );
}

function Row({ children, style: s }: any) {
  return <View style={[styles.row, s]}>{children}</View>;
}
function Col({ children, style: s }: any) {
  return <View style={s}>{children}</View>;
}
function Wrap({ children }: any) {
  return <View style={styles.wrap}>{children}</View>;
}
function List({ children }: any) {
  return <View style={{ gap: 8 }}>{children}</View>;
}
function ListItem({ children }: any) {
  return <View style={styles.listItem}>{children}</View>;
}
function Label({ children }: any) {
  return <Text style={styles.label}>{children}</Text>;
}
function Tiny({ children, style: s }: any) {
  return <Text style={[styles.tiny, s]}>{children}</Text>;
}
function Spacer({ size = 8 }: { size?: number }) {
  return <View style={{ height: size }} />;
}
function Banner({ type, text }: { type: "error" | "info"; text: string }) {
  return (
    <View style={[styles.banner, type === "error" ? styles.bannerErr : styles.bannerInfo]}>
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}
function Chip({ text, tone = "muted" }: { text: string; tone?: "muted" | "good" | "warn" | "neutral" }) {
  return (
    <View style={[styles.chip, chipTone(tone)]}>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}
function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue(tone)}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function TrendBadge({ bias, strength }: { bias: "up" | "down" | "sideways"; strength: number }) {
  const tone = bias === "up" ? "good" : bias === "down" ? "warn" : "neutral";
  return (
    <View style={[styles.trendBadge, chipTone(tone as any)]}>
      <Text style={styles.chipText}>
        {bias.toUpperCase()} · {pct(strength)}
      </Text>
    </View>
  );
}
function BreadthBar({ advancers, decliners, unchanged }: { advancers: number; decliners: number; unchanged: number }) {
  const total = Math.max(1, advancers + decliners + unchanged);
  const a = (advancers / total) * 100;
  const d = (decliners / total) * 100;
  const u = 100 - a - d;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barSeg, { flexBasis: `${a}%` }, styles.good]} />
      <View style={[styles.barSeg, { flexBasis: `${u}%` }, styles.neutral]} />
      <View style={[styles.barSeg, { flexBasis: `${d}%` }, styles.warn]} />
    </View>
  );
}
function VolumeBar({ up, down, total }: { up: number; down: number; total: number }) {
  const t = Math.max(1, total || up + down);
  const pUp = (up / t) * 100;
  const pDown = (down / t) * 100;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barSeg, { flexBasis: `${pUp}%` }, styles.good]} />
      <View style={[styles.barSeg, { flexBasis: `${pDown}%` }, styles.warn]} />
    </View>
  );
}
function ConfidenceBar({ confidence }: { confidence: number }) {
  const pctv = Math.max(0, Math.min(1, confidence));
  return (
    <View style={styles.confTrack}>
      <View style={[styles.confFill, { width: `${pctv * 100}%` }]} />
      <Text style={styles.confText}>{pct(confidence)}</Text>
    </View>
  );
}

/* ---------- Helpers ---------- */

const isNum = (v: any): v is number => typeof v === "number" && Number.isFinite(v);
const safe01 = (v: number) => Math.max(0, Math.min(1, v));

const fmtNum = (n: number) =>
  Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);

const fmtFloat = (v: number, d: number) => {
  if (!isNum(v)) return "–";
  const f = Math.pow(10, d);
  return String(Math.round(v * f) / f);
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => `${Math.round(safe01(v) * 100)}%`;
const sign = (v: number) => (v > 0 ? "+" : "");

const pcTone = (ratio: number) => (ratio < 0.9 ? "good" : ratio > 1.1 ? "warn" : "neutral");
const chipTone = (tone: "muted" | "good" | "warn" | "neutral") =>
  tone === "good" ? styles.goodBg : tone === "warn" ? styles.warnBg : tone === "neutral" ? styles.neutralBg : styles.mutedBg;

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0b0c10" },
  container: { padding: 16, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: "#e9eef5" },
  updated: { fontSize: 12, color: "#9aa4b2", marginTop: -8, marginBottom: 4 },

  card: {
    backgroundColor: "#12141a",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1e2230",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#e9eef5" },
  cardSubtitle: { fontSize: 12, color: "#9aa4b2" },

  row: { flexDirection: "row" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  listItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "#0f1117",
    borderWidth: 1,
    borderColor: "#1a1f2b",
  },

  label: { fontSize: 12, color: "#9aa4b2", marginBottom: 6, letterSpacing: 0.2 },
  tiny: { fontSize: 11, color: "#94a3b8" },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipText: { fontSize: 12, color: "#e9eef5" },

  stat: { flex: 1, padding: 8, alignItems: "center" },
  statValue: (tone: "neutral" | "good" | "warn") => ({
    fontSize: 18,
    fontWeight: "700",
    color: tone === "good" ? "#12b76a" : tone === "warn" ? "#f97066" : "#e9eef5",
  }),
  statLabel: { fontSize: 11, color: "#9aa4b2", marginTop: 4 },

  trendBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  barTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#0f1117",
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#1a1f2b",
  },
  barSeg: { height: "100%" },

  confTrack: {
    height: 20,
    borderRadius: 8,
    backgroundColor: "#0f1117",
    borderWidth: 1,
    borderColor: "#1a1f2b",
    overflow: "hidden",
    minWidth: 120,
  },
  confFill: { height: "100%", backgroundColor: "#2e7dd7" },
  confText: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    textAlign: "center",
    // RN web will ignore textAlignVertical; safe to keep
    textAlignVertical: "center" as any,
    color: "#e9eef5",
    fontSize: 12,
  },

  symbol: { color: "#e9eef5", fontWeight: "700", marginRight: 10, fontSize: 14 },

  good: { backgroundColor: "#12b76a" },
  warn: { backgroundColor: "#f97066" },
  neutral: { backgroundColor: "#3d4a5f" },

  goodBg: { backgroundColor: "rgba(18,183,106,0.15)", borderColor: "rgba(18,183,106,0.35)" },
  warnBg: { backgroundColor: "rgba(249,112,102,0.15)", borderColor: "rgba(249,112,102,0.35)" },
  neutralBg: { backgroundColor: "rgba(61,74,95,0.25)", borderColor: "rgba(61,74,95,0.45)" },
  mutedBg: { backgroundColor: "rgba(154,164,178,0.15)", borderColor: "rgba(154,164,178,0.35)" },

  banner: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  bannerErr: { backgroundColor: "rgba(249,112,102,0.12)", borderColor: "rgba(249,112,102,0.35)" },
  bannerInfo: { backgroundColor: "rgba(46,125,215,0.12)", borderColor: "rgba(46,125,215,0.35)" },
  bannerText: { color: "#e9eef5" },
});

