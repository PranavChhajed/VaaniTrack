"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Scroll-triggered entrance for whatever sits below the fold, without ever
 * hiding content from anyone who can't run this effect. The server-rendered
 * (and first client) render carries no hidden styling at all: that's what
 * a request without JS sees, permanently.
 *
 * Only after mount, for an element that starts below the viewport and only
 * if motion is allowed, does `useLayoutEffect` add the pending style,
 * before the browser's first paint, so nothing flashes visible-then-hidden.
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const belowFold = el.getBoundingClientRect().top > window.innerHeight;
    if (reduce || !belowFold) return;
    setPending(true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pending]);

  return (
    <div
      ref={ref}
      className={[className, pending ? (visible ? "reveal reveal-visible" : "reveal") : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
