"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Scene = {
  image: ReactNode;
  label: string;
  sample: boolean;
};

const intervalMs = 5000;

export function HomeCoverACarousel({
  scenes,
  interactive = true,
  desktop = false,
}: {
  scenes: readonly Scene[];
  interactive?: boolean;
  desktop?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const count = scenes.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [pointerOverCarousel, setPointerOverCarousel] = useState(false);
  const [focusWithinCarousel, setFocusWithinCarousel] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const activeIndex = count ? index % count : 0;
  const canAutoplay =
    interactive &&
    count > 1 &&
    !paused &&
    !reducedMotion &&
    visible &&
    pageVisible &&
    !pointerOverCarousel &&
    !focusWithinCarousel;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(preference.matches);
    syncPreference();
    preference.addEventListener("change", syncPreference);
    return () => preference.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () =>
      document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    if (
      !interactive ||
      count < 2 ||
      !root.current ||
      !("IntersectionObserver" in window)
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { threshold: 0.2 },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [interactive, count]);

  useEffect(() => {
    if (!canAutoplay) return;
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % count),
      intervalMs,
    );
    return () => window.clearTimeout(timer);
  }, [activeIndex, canAutoplay, count]);

  if (!count) return null;

  const move = (step: number) => {
    const next = (activeIndex + step + count) % count;
    setIndex(next);
    setAnnouncement(
      `${String(next + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}, ${scenes[next]?.label}`,
    );
  };

  return (
    <figure
      ref={root}
      data-home-a-carousel
      role="region"
      aria-roledescription="캐러셀"
      aria-label="여행 사진"
      className={`bg-muted relative m-0 min-h-[260px] w-full min-w-0 overflow-hidden ${desktop ? "h-full min-h-[420px]" : "lg:h-full lg:min-h-[500px]"}`}
      onPointerEnter={() => setPointerOverCarousel(true)}
      onPointerLeave={() => setPointerOverCarousel(false)}
      onFocusCapture={() => setFocusWithinCarousel(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocusWithinCarousel(false);
      }}
    >
      {scenes.map((scene, position) => (
        <div
          key={position}
          className="home-a-slide absolute inset-0"
          data-active={position === activeIndex}
          aria-hidden={position !== activeIndex}
        >
          <div className="relative h-full w-full overflow-hidden">
            {scene.image}
          </div>
        </div>
      ))}
      <figcaption className="bg-background/95 text-foreground absolute bottom-6 left-5 z-10 max-w-[calc(100%-185px)] px-4 py-3 text-xs leading-snug shadow-[0_8px_24px_rgb(12_37_41_/_15%)] backdrop-blur-sm sm:bottom-7 sm:left-7 sm:max-w-xs">
        <span className="text-muted-foreground block font-semibold tracking-[0.16em] tabular-nums">
          SCENE {String(activeIndex + 1).padStart(2, "0")} /{" "}
          {String(count).padStart(2, "0")}
        </span>
        <strong className="mt-1 block font-medium break-keep">
          {scenes[activeIndex]?.label}
        </strong>
        {scenes[activeIndex]?.sample && (
          <span className="text-muted-foreground mt-1 block text-[10px]">
            예시 사진
          </span>
        )}
      </figcaption>

      {interactive && count > 1 && (
        <>
          <div
            role="group"
            aria-label="사진 전환 제어"
            className="absolute right-5 bottom-6 z-20 flex items-center gap-1.5 sm:right-7 sm:bottom-7"
          >
            <button
              type="button"
              aria-label="이전 사진"
              onClick={() => move(-1)}
              className="bg-background/95 text-foreground hover:bg-background grid size-11 place-items-center shadow-sm transition-colors"
            >
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="다음 사진"
              onClick={() => move(1)}
              className="bg-background/95 text-foreground hover:bg-background grid size-11 place-items-center shadow-sm transition-colors"
            >
              <ChevronRight size={19} aria-hidden="true" />
            </button>
            {!reducedMotion && (
              <button
                type="button"
                aria-label={
                  paused ? "자동 전환 다시 재생" : "자동 전환 일시정지"
                }
                aria-pressed={paused}
                onClick={() => setPaused((current) => !current)}
                className="bg-background/95 text-foreground hover:bg-background min-h-11 min-w-14 px-2 text-xs font-semibold whitespace-nowrap shadow-sm transition-colors"
              >
                {paused ? "재생" : "일시정지"}
              </button>
            )}
          </div>
          <div
            className="absolute inset-x-0 bottom-0 z-20 h-1 overflow-hidden bg-white/40"
            aria-hidden="true"
          >
            {canAutoplay && (
              <span
                key={activeIndex}
                className="home-a-progress bg-primary block h-full"
                style={{ animationDuration: `${intervalMs}ms` }}
              />
            )}
          </div>
          <span className="sr-only" aria-live="polite">
            {announcement}
          </span>
        </>
      )}
    </figure>
  );
}
