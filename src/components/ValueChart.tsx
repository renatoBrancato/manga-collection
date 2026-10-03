"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/money";

export type ValuePoint = { day: string; value: number | null };

const WIDTH = 600;
const PAD_TOP = 10;
const PAD_BOTTOM = 6;

export function formatEuro(value: number): string {
  return formatMoney(value);
}

export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Grafico a linea dell'andamento del valore. L'asse X è temporale (non per
 * indice), così punti radi — tipici dello storico di un singolo pezzo —
 * restano distanziati correttamente. I valori nulli (pezzo rimosso)
 * interrompono la linea.
 */
export default function ValueChart({
  points,
  height = 150,
  renderTooltip,
}: {
  points: ValuePoint[];
  height?: number;
  renderTooltip?: (point: ValuePoint) => ReactNode;
}) {
  const gradientId = `value-gradient-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;

    const times = points.map((point) => Date.parse(`${point.day}T00:00:00`));
    const start = Math.min(...times);
    const end = Math.max(...times);
    const values = points.map((point) => point.value).filter((value): value is number => value != null);

    let min = values.length ? Math.min(...values) : 0;
    let max = values.length ? Math.max(...values) : 1;
    if (max === min) {
      const pad = Math.max(1, Math.abs(max) * 0.05);
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.12;
      min = Math.max(0, min - pad);
      max += pad;
    }

    const x = (time: number) => (end === start ? WIDTH / 2 : ((time - start) / (end - start)) * WIDTH);
    const y = (value: number) => PAD_TOP + (1 - (value - min) / (max - min)) * (height - PAD_TOP - PAD_BOTTOM);

    const coords = points.map((point, index) => ({
      x: x(times[index]),
      y: point.value == null ? null : y(point.value),
      point,
    }));

    const segments: Array<Array<{ x: number; y: number }>> = [];
    let current: Array<{ x: number; y: number }> = [];
    for (const coord of coords) {
      if (coord.y == null) {
        if (current.length) segments.push(current);
        current = [];
      } else {
        current.push({ x: coord.x, y: coord.y });
      }
    }
    if (current.length) segments.push(current);

    return { coords, segments };
  }, [points, height]);

  if (!geometry) return null;

  function handleMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg || !geometry) return;
    const rect = svg.getBoundingClientRect();
    const position = ((clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    geometry.coords.forEach((coord, index) => {
      if (Math.abs(coord.x - position) < Math.abs(geometry.coords[nearest].x - position)) nearest = index;
    });
    setHover(nearest);
  }

  const active = hover != null ? geometry.coords[hover] : null;
  const single = geometry.segments.length === 1 && geometry.segments[0].length === 1 ? geometry.segments[0][0] : null;

  return (
    <div className="relative select-none" style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="h-full w-full touch-pan-y"
        onMouseMove={(event) => handleMove(event.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(event) => handleMove(event.touches[0].clientX)}
        onTouchMove={(event) => handleMove(event.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(129 140 248)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(129 140 248)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {geometry.segments
          .filter((segment) => segment.length > 1)
          .map((segment, index) => {
            const line = segment.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
            const area = `${line} L${segment.at(-1)!.x.toFixed(2)},${height} L${segment[0].x.toFixed(2)},${height} Z`;
            return (
              <g key={index}>
                <path d={area} fill={`url(#${gradientId})`} />
                <path
                  d={line}
                  fill="none"
                  stroke="rgb(165 180 252)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={0}
            y2={height}
            stroke="rgb(148 163 184)"
            strokeOpacity="0.4"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {single && (
        <span
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-300 ring-4 ring-indigo-400/20"
          style={{ left: `${(single.x / WIDTH) * 100}%`, top: `${(single.y / height) * 100}%` }}
        />
      )}

      {active && active.y != null && (
        <span
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-4 ring-indigo-400/40"
          style={{ left: `${(active.x / WIDTH) * 100}%`, top: `${(active.y / height) * 100}%` }}
        />
      )}

      {active && (
        <div
          className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950/95 px-2.5 py-1.5 text-xs shadow-xl"
          style={{
            left: `${(active.x / WIDTH) * 100}%`,
            transform: `translateX(${active.x < WIDTH * 0.2 ? "0" : active.x > WIDTH * 0.8 ? "-100%" : "-50%"})`,
          }}
        >
          <div className="font-semibold text-white">
            {active.point.value != null ? formatEuro(active.point.value) : "Rimosso"}
          </div>
          <div className="text-slate-400">{formatDay(active.point.day)}</div>
          {renderTooltip?.(active.point)}
        </div>
      )}
    </div>
  );
}
