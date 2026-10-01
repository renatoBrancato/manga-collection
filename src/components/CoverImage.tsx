"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MangaItem } from "@/lib/types";
import { getCoverCandidates } from "@/lib/covers";

const PALETTES = [
  "from-rose-500 to-orange-400",
  "from-indigo-500 to-sky-400",
  "from-emerald-500 to-teal-400",
  "from-fuchsia-500 to-purple-400",
  "from-amber-500 to-yellow-400",
];

function paletteFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function initials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default function CoverImage({
  item,
  className = "",
}: {
  item: Pick<MangaItem, "title" | "image_url" | "isbn">;
  className?: string;
}) {
  const candidates = useMemo(() => getCoverCandidates(item), [item]);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const src = candidates[index];

  // Un'immagine gia' in cache puo' completarsi prima che React agganci
  // onLoad: senza questo controllo lo scheletro resterebbe per sempre.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, [src]);

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br ${paletteFor(
          item.title
        )} font-bold text-white ${className}`}
      >
        {initials(item.title) || "📖"}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-800/60 ${className}`}>
      {!loaded && (
        <div aria-hidden="true" className="cover-skeleton absolute inset-0">
          <span className="absolute inset-0 flex items-center justify-center text-xl opacity-30">📖</span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={item.title}
        loading="lazy"
        decoding="async"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          setIndex((i) => i + 1);
        }}
      />
    </div>
  );
}
