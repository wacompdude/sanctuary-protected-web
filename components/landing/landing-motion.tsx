"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Soft entrance for hero copy — fade + slight rise. */
export function LandingMotion({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`transition-[opacity,transform] duration-1000 ease-out ${
        ready ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}
