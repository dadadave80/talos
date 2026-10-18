"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

// Children land one after another (the `land` keyframe) the first time the list enters the viewport. Before that they
// hold their space invisibly, so nothing shifts; reduced motion shows them at once (the global rule zeroes animation).
export function Sequence({ children, className = "", step = 160 }: { children: ReactNode; className?: string; step?: number }) {
  const root = useRef<HTMLOListElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setOn(true), io.disconnect()), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <ol ref={root} className={className}>
      {Children.toArray(children).map((c, i) => (
        <li key={i} className={on ? "land" : "opacity-0"} style={on ? { animationDelay: `${i * step}ms` } : undefined}>
          {c}
        </li>
      ))}
    </ol>
  );
}
