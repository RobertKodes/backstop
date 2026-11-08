"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface Series {
  id: string;
  label: string;
  /** Direct label drawn at the end of the line. */
  short?: string;
  /** CSS color (use a token var). */
  color: string;
  dashed?: boolean;
  points: { t: number; v: number }[];
}

interface Props {
  series: Series[];
  /** Accessible summary of what the chart shows. */
  summary: string;
  formatValue: (v: number) => string;
  formatTime: (t: number) => string;
  height?: number;
  /** Optional caption shown under the chart. */
  caption?: React.ReactNode;
  testId?: string;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((entries) => setW(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + step * i);
}

const PAD = { top: 16, right: 64, bottom: 28, left: 64 };

export function LineChart({ series, summary, formatValue, formatTime, height = 260, caption, testId }: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const primary = series[0];
  const times = useMemo(() => primary?.points.map((p) => p.t) ?? [], [primary]);

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (!all.length || width <= 0) return null;
    let tMin = Math.min(...all.map((p) => p.t));
    let tMax = Math.max(...all.map((p) => p.t));
    if (tMin === tMax) {
      tMin -= 1;
      tMax += 1;
    }
    let vMin = Math.min(...all.map((p) => p.v));
    let vMax = Math.max(...all.map((p) => p.v));
    const span = vMax - vMin || Math.abs(vMax) * 0.1 || 1;
    vMin -= span * 0.08;
    vMax += span * 0.08;
    const innerW = Math.max(10, width - PAD.left - PAD.right);
    const innerH = height - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin)) * innerW;
    const y = (v: number) => PAD.top + (1 - (v - vMin) / (vMax - vMin)) * innerH;
    return { x, y, vMin, vMax, tMin, tMax, innerW, innerH };
  }, [series, width, height]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo || !times.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    times.forEach((t, i) => {
      const d = Math.abs(geo.x(t) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!times.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setHover((h) => {
        const cur = h ?? times.length - 1;
        if (e.key === "Home") return 0;
        if (e.key === "End") return times.length - 1;
        return Math.max(0, Math.min(times.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1)));
      });
    } else if (e.key === "Escape") setHover(null);
  };

  const hoverT = hover !== null ? times[hover] : undefined;
  const valueAt = (s: Series, t: number) => {
    let v: number | undefined;
    for (const p of s.points) if (p.t <= t) v = p.v;
    return v ?? s.points[0]?.v;
  };

  return (
    <figure className="m-0 grid gap-3" data-testid={testId}>
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
          {series.map((s) => (
            <li key={s.id} className="inline-flex items-center gap-2">
              <svg width="22" height="8" aria-hidden="true">
                <line
                  x1="1"
                  y1="4"
                  x2="21"
                  y2="4"
                  stroke={s.color}
                  strokeWidth="2.5"
                  strokeDasharray={s.dashed ? "5 3" : undefined}
                  strokeLinecap="round"
                />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        {geo ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={summary}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            className="block touch-pan-y"
          >
            {niceTicks(geo.vMin, geo.vMax).map((v, i) => (
              <g key={i}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={geo.y(v)}
                  y2={geo.y(v)}
                  stroke="var(--chart-grid)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 8}
                  y={geo.y(v)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="11"
                  fill="var(--muted)"
                >
                  {formatValue(v)}
                </text>
              </g>
            ))}
            {niceTicks(geo.tMin, geo.tMax, width < 480 ? 2 : 4).map((t, i) => (
              <text key={i} x={geo.x(t)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {formatTime(t)}
              </text>
            ))}
            {series.map((s) => {
              if (!s.points.length) return null;
              const d = s.points
                .map((p, i) => `${i ? "L" : "M"}${geo.x(p.t).toFixed(1)},${geo.y(p.v).toFixed(1)}`)
                .join("");
              const last = s.points[s.points.length - 1]!;
              return (
                <g key={s.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? "6 4" : undefined}
                  />
                  <text
                    x={geo.x(last.t) + 6}
                    y={geo.y(last.v)}
                    dominantBaseline="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="var(--ink)"
                  >
                    {s.short ?? s.label.split(" ")[0]}
                  </text>
                </g>
              );
            })}
            {hoverT !== undefined ? (
              <g aria-hidden="true">
                <line
                  x1={geo.x(hoverT)}
                  x2={geo.x(hoverT)}
                  y1={PAD.top}
                  y2={height - PAD.bottom}
                  stroke="var(--line-strong)"
                  strokeWidth="1"
                />
                {series.map((s) => {
                  const v = valueAt(s, hoverT);
                  if (v === undefined) return null;
                  return (
                    <circle
                      key={s.id}
                      cx={geo.x(hoverT)}
                      cy={geo.y(v)}
                      r="4.5"
                      fill={s.color}
                      stroke="var(--surface)"
                      strokeWidth="2"
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>
        ) : (
          <div className="skeleton h-full w-full" aria-hidden="true" />
        )}
        {geo && hoverT !== undefined ? (
          <div
            className="pointer-events-none absolute top-1 rounded border border-line-strong bg-surface px-3 py-2 text-sm shadow"
            style={{
              left: Math.min(Math.max(geo.x(hoverT) + 12, 0), Math.max(0, width - 200)),
            }}
            role="status"
            aria-live="polite"
          >
            <p className="text-muted">{formatTime(hoverT)}</p>
            {series.map((s) => {
              const v = valueAt(s, hoverT);
              return (
                <p key={s.id} className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ background: s.color }} />
                  {s.label}: <strong>{v === undefined ? "–" : formatValue(v)}</strong>
                </p>
              );
            })}
          </div>
        ) : null}
      </div>
      {caption ? <figcaption className="text-sm text-muted">{caption}</figcaption> : null}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">View as table</summary>
        <div className="table-scroll mt-2 max-h-72 overflow-y-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                {series.map((s) => (
                  <th key={s.id} scope="col" className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times
                .slice(-60)
                .reverse()
                .map((t) => (
                  <tr key={t}>
                    <td>{formatTime(t)}</td>
                    {series.map((s) => {
                      const v = valueAt(s, t);
                      return (
                        <td key={s.id} className="num">
                          {v === undefined ? "–" : formatValue(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
