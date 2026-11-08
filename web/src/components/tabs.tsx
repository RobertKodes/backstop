"use client";

import { useId, useRef } from "react";

export interface TabDef {
  id: string;
  label: string;
}

/** WAI-ARIA tabs with roving tabindex and arrow/Home/End keys. */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  children,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(
    0,
    tabs.findIndex((t) => t.id === value),
  );

  const onKey = (e: React.KeyboardEvent) => {
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="tablist" onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={t.id === value}
            aria-controls={`${base}-panel`}
            tabIndex={t.id === value ? 0 : -1}
            className="tab"
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${value}`}
        tabIndex={0}
        className="pt-5 focus-visible:outline-offset-4"
      >
        {children}
      </div>
    </div>
  );
}
