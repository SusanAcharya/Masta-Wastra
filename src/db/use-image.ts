"use client";

import { useEffect, useState } from "react";
import { getDb } from "./schema";

// An object URL for a stored image, revoked when the component lets go of it.
export function useImageUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!id) return;
    let made: string | undefined;
    let alive = true;
    getDb()
      .images.get(id)
      .then((img) => {
        if (!alive || !img) return;
        made = URL.createObjectURL(img.blob);
        setUrl(made);
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return id ? url : undefined;
}
