export const fmt = (n: unknown, digits = 2, dash = "—") => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(digits) : dash;
};

export const pct = (n: unknown, dash = "—") => {
  const v = Number(n);
  if (!Number.isFinite(v)) return dash;
  const clamped = Math.max(0, Math.min(1, v));
  return (clamped * 100).toFixed(0) + "%";
};

// For progress components that need 0..1 (fallback to 0, but show dashed text)
export const ratio01 = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
};

