import * as React from "react";
import { cn } from "./lib/utils";

export function Input({
  className,
  type = "text",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        "rounded-control border-input bg-surface text-foreground placeholder:text-muted-foreground/80 disabled:bg-muted min-h-[52px] w-full border px-4 text-base disabled:cursor-not-allowed disabled:opacity-80",
        className,
      )}
      {...props}
    />
  );
}
