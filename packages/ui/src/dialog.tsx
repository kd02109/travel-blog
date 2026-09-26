"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "./lib/utils";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      className={cn(
        "rounded-panel border-border bg-surface text-foreground backdrop:bg-foreground/40 w-[min(92vw,32rem)] border p-0 shadow-[0_8px_24px_rgb(23_60_66_/_12%)]",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
    >
      <div className="border-border flex items-start justify-between gap-4 border-b p-6">
        <div>
          <h2 id={`${id}-title`} className="text-xl font-semibold">
            {title}
          </h2>
          {description && (
            <p
              id={`${id}-description`}
              className="text-muted-foreground mt-2 text-sm"
            >
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="대화상자 닫기"
          className="rounded-control hover:bg-muted inline-flex size-12 shrink-0 items-center justify-center"
          onClick={() => onOpenChange(false)}
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}
