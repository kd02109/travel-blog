"use client";

import * as React from "react";
import { cn } from "./lib/utils";

export function Tabs({
  tabs,
  value,
  onValueChange,
  label = "보기 방식",
}: {
  tabs: Array<{ value: string; label: string; content?: React.ReactNode }>;
  value?: string;
  onValueChange?: (value: string) => void;
  label?: string;
}) {
  const [internalValue, setInternalValue] = React.useState(
    value ?? tabs[0]?.value ?? "",
  );
  const active = value ?? internalValue;
  const activeTab = tabs.find((tab) => tab.value === active) ?? tabs[0];
  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="border-border flex min-h-12 gap-2 overflow-x-auto border-b"
        onKeyDown={(event) => {
          const current = tabs.findIndex((tab) => tab.value === active);
          let next: number;
          if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
          else if (event.key === "ArrowLeft")
            next = (current - 1 + tabs.length) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault();
          const button =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="tab"]',
            )[next];
          button?.focus();
          const nextValue = tabs[next]?.value;
          if (nextValue && value === undefined) setInternalValue(nextValue);
          if (nextValue) onValueChange?.(nextValue);
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`tab-${tab.value}`}
            aria-controls={`panel-${tab.value}`}
            aria-selected={active === tab.value}
            tabIndex={active === tab.value ? 0 : -1}
            className={cn(
              "text-muted-foreground min-h-12 shrink-0 border-b-2 border-transparent px-4 text-base",
              active === tab.value &&
                "border-primary text-foreground font-semibold",
            )}
            onClick={() => {
              if (value === undefined) setInternalValue(tab.value);
              onValueChange?.(tab.value);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab?.content !== undefined && (
        <div
          role="tabpanel"
          id={`panel-${activeTab.value}`}
          aria-labelledby={`tab-${activeTab.value}`}
          className="pt-5"
        >
          {activeTab.content}
        </div>
      )}
    </div>
  );
}
