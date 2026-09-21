"use client";

import { useMemo, useState } from "react";
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
  const src = candidates[index];

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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={item.title}
      className={`object-cover ${className}`}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
