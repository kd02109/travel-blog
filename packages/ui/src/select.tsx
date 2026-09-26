import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./lib/utils";

export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        data-slot="select"
        className={cn(
          "rounded-control border-input bg-surface text-foreground disabled:bg-muted min-h-[52px] w-full appearance-none border px-4 pr-12 text-base disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2"
      />
    </span>
  );
}
