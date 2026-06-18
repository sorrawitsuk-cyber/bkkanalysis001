"use client";

import { useEffect, useState } from "react";
import { loadSubdistrictFeatures } from "@/lib/subdistrict-view";

export function useSubdistrictFeatures(enabled: boolean): any[] {
  const [features, setFeatures] = useState<any[]>([]);

  useEffect(() => {
    if (!enabled || features.length > 0) return;
    let cancelled = false;
    loadSubdistrictFeatures()
      .then((loadedFeatures) => {
        if (!cancelled) setFeatures(loadedFeatures);
      })
      .catch((err) => console.error("Failed to load subdistrict boundaries:", err));
    return () => {
      cancelled = true;
    };
  }, [enabled, features.length]);

  return features;
}
