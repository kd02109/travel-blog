import * as React from "react";
import { cn } from "./lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="rounded-panel border-border w-full overflow-x-auto border">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-left text-base", className)}
        {...props}
      />
    </div>
  );
}
export function TableHeader(props: React.ComponentProps<"thead">) {
  return <thead className="bg-muted text-foreground text-sm" {...props} />;
}
export function TableBody(props: React.ComponentProps<"tbody">) {
  return <tbody className="divide-border divide-y" {...props} />;
}
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr className={cn("hover:bg-muted/50 min-h-12", className)} {...props} />
  );
}
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("h-12 px-4 font-semibold", className)}
      {...props}
    />
  );
}
export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
