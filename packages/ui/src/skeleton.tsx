import { cn } from "./lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-control bg-muted animate-pulse motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export function LoadingState({
  label = "불러오는 중이에요…",
}: {
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-2/5" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-5 w-3/4" />
    </div>
  );
}
