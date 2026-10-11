"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "./button";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<
    "idle" | "copying" | "copied" | "failed"
  >("idle");
  async function copy() {
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  return (
    <span>
      <Button
        type="button"
        variant="outline"
        onClick={copy}
        disabled={status === "copying"}
        aria-label={label}
        title={label}
      >
        {status === "copied" ? (
          <Check size={18} aria-hidden="true" />
        ) : (
          <Copy size={18} aria-hidden="true" />
        )}
        {status === "copied" ? "복사됨" : "복사"}
      </Button>
      <span role="status" aria-live="polite">
        {status === "failed"
          ? " 복사하지 못했습니다. 아래 텍스트를 직접 선택해 복사해 주세요."
          : status === "copied"
            ? " 클립보드에 복사했습니다."
            : ""}
      </span>
    </span>
  );
}
