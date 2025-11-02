// client/src/screens/InsightsScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fmt, pct, ratio01 } from "../lib/num";

import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { getSummary, getSentiment, getPatterns } from "../api/insights";

/* ---------- Types (same shape your server returns) ---------- */

type Summary = {
  timeframe: string;
  updated_at: string;
  breadth: { advancers: number; decliners: number; unchanged: number };
  volume: { total: number; up: number; down: number };
  trend: { bias: "up" | "down" | "sideways"; strength: number };
  iv_rank: Record<string, number | null | undefined>;
  note?: string;
};

type Sentiment = {
  put_call_vol_ratio: number | null;
  put_call_oi_ratio: number | null;
  dark_pool_score: number | null; // 0..1
  news_sentiment: { score: number | null; sample: number | null };
  options_uoa: { symbol: string; side: "CALL" | "PUT"; ratio: number | null; note?: string }[] | null;
};

type PatternItem = { symbol: string; type: string; confidence: number | null };
type Patterns = { timeframe: string; patterns: PatternItem[] | null };

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updatedText = useMemo(() => {
    if (!summary?.updated_at) return "";
    const d = new Date(summary.updated_at);
    return `Updated ${d.toLocaleString()}`;
  }, [summary?.updated_at]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <Text style={styles.title}>Insights</Text>
        {!!updatedText && <Text style={styles.updated}>{updatedText}</Text>}
        {err && <Banner type="error" text={err} />}

        {/* ⬇️ Add this block */}
        {(() => {
          const mode = (summary as any)?.meta ?? (sentiment as any)?.meta ?? (patterns as any)?.meta;
          const closed = mode?.session === "CLOSED";
          const usingCache = mode?.data_source === "cache";
          if (!closed && !usingCache) return null;
          return (
            <Banner
              type="info"
              text={
                closed
                  ? "Market closed — showing last snapshot"
                  : "Showing cached snapshot until live data is available"
              }
            />
          );
        })()}
        {/* ⬆️ Add this block */}


        {/* SUMMARY CARD */}
        {summary && (
          <Card title="Summary" subtitle={summary.timeframe?.toUpperCase?.()}>
            <Row>
              <Col style={{ flex: 1 }}>
                <Label>Market Breadth</Label>
                <BreadthBar
                  advancers={num(summary.breadth?.advancers)}
                  decliners={num(summary.breadth?.decliners)}
                  unchanged={num(summary.breadth?.unchanged)}
                />
                <Tiny>
                  A:{fmtInt(summary.breadth?.advancers)} · D:{fmtInt(summary.breadth?.decliners)} · U:
                  {fmtInt(summary.breadth?.unchanged)}
                </Tiny>
              </Col>
              <Col style={{ width: 12 }} />
              <Col style={{ flex: 1 }}>
                <Label>Volume</Label>
                <VolumeBar
                  up={num(summary.volume?.up)}
                  down={num(summary.volume?.down)}
                  total={num(summary.volume?.total)}
                />
                <Tiny>
                  Up {fmtNum(summary.volume?.up)} · Down {fmtNum(summary.volume?.down)} · Total{" "}
                  {fmtNum(summary.volume?.total)}
                </Tiny>
              </Col>
            </Row>

            <Spacer size={12} />
            <Row style={{ alignItems: "center" }}>
              <Col>
                <Label>Trend</Label>
                <TrendBadge bias={summary.trend?.bias ?? "sideways"} strength={num01(summary.trend?.strength)} />
              </Col>
              <Col style={{ flex: 1 }} />
              <Col>
                <Label>IV Rank</Label>
                <Wrap>
                  {Object.entries(summary.iv_rank ?? {}).map(([sym, r]) => {
                    const v = toNum(r);
                    const text = Number.isFinite(v) ? `${sym} ${v}` : `${sym} —`;
                    const tone = Number.isFinite(v) ? ivTone(v) : "neutral";
                    return <Chip key={sym} tone={tone as any} text={text} />;
                  })}
                </Wrap>
              </Col>
            </Row>

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
                value={fmt(sentiment.put_call_vol_ratio, 2)}
                tone={pcTone(sentiment.put_call_vol_ratio)}
              />
              <Stat
                label="Put/Call (OI)"
                value={fmt(sentiment.put_call_oi_ratio, 2)}
                tone={pcTone(sentiment.put_call_oi_ratio)}
              />
              <Stat label="Dark Pool" value={pct(sentiment.dark_pool_score)} />
              <Stat
                label="News"
                value={newsString(sentiment.news_sentiment)}
              />
            </Row>

            <Spacer size={10} />
            <Label>Unusual Options Activity</Label>
            <List>
              {(sentiment.options_uoa ?? []).map((u, i) => {
                const ratioTxt = `ratio ${fmt(u?.ratio, 2)}`;
                return (
                  <ListItem key={`${u?.symbol ?? "?"}-${i}`}>
                    <Wrap>
                      <Chip
                        tone={u?.side === "CALL" ? "good" : "warn"}
                        text={`${u?.symbol ?? "—"} ${u?.side ?? ""}`.trim()}
                      />
                      <Chip text={ratioTxt} />
                      {u?.note ? <Chip tone="muted" text={u.note} /> : null}
                    </Wrap>
                  </ListItem>
                );
              })}
            </List>
          </Card>
        )}

        {/* PATTERNS CARD */}
        {patterns && (
          <Card title="Patterns" subtitle={`${patterns.timeframe?.toUpperCase?.()} scans`}>
            <List>
              {(patterns.patterns ?? []).map((p) => (
                <ListItem key={`${p.symbol}-${p.type}`}>
                  <Row style={{ alignItems: "center" }}>
                    <Text style={styles.symbol}>{p.symbol}</Text>
                    <Chip tone="muted" text={p.type} />
                    <View style={{ flex: 1 }} />
                    <ConfidenceBar confidence={num01(p.confidence)} />
                  </Row>
                </ListItem>
              ))}
            </List>
          </Card>
        )}

        {!loading && !summary && !sentiment && !patterns && (
          <Text style={{ opacity: 0.6, textAlign: "center", marginTop: 24 }}>
            No data yet. Pull to refresh.
          </Text>
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
        {bias?.toUpperCase?.()} · {pct(strength)}
      </Text>
    </View>
  );
}
function BreadthBar({ advancers, decliners, unchanged }: { advancers: number; decliners: number; unchanged: number }) {
  const total = Math.max(1, advancers + decliners + unchanged);
  const a = (advancers / total) * 100;
  const d = (decliners / total) * 100;
  const u = Math.max(0, 100 - a - d);
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
  const pUp = Math.max(0, Math.min(100, (up / t) * 100));
  const pDown = Math.max(0, Math.min(100, (down / t) * 100));
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
      <Text style={styles.confText}>{pct(pctv)}</Text>
    </View>
  );
}

/* ---------- Helpers (null-safe) ---------- */

const toNum = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : NaN);
const num = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const num01 = (x: any) => {
  const v = Number(x);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
};

const fmtInt = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v).toString() : "—";
};

const fmtNum = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v)
    ? Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v)
    : "—";
};

const newsString = (ns: { score: number | null; sample: number | null } | null) => {
  const v = toNum(ns?.score);
  if (!Number.isFinite(v)) return "—";
  const s = v > 0 ? "+" : "";
  const sample = Number.isFinite(Number(ns?.sample)) ? String(ns?.sample) : "—";
  // use fmt for 2dp, but ensure we show absolute value
  const val = fmt(Math.abs(v), 2);
  return `${s}${val} (${sample})`;
};

const pcTone = (ratio: number | null | undefined) => {
  const v = Number(ratio);
  if (!Number.isFinite(v)) return "neutral";
  return v < 0.9 ? "good" : v > 1.1 ? "warn" : "neutral";
};

const ivTone = (r: number) => (r >= 60 ? "warn" : r <= 20 ? "good" : "neutral");
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
    textAlignVertical: "center",
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
  },
  bannerErr: { backgroundColor: "rgba(249,112,102,0.12)", borderColor: "rgba(249,112,102,0.35)" },
  bannerInfo: { backgroundColor: "rgba(46,125,215,0.12)", borderColor: "rgba(46,125,215,0.35)" },
  bannerText: { color: "#e9eef5" },
});
