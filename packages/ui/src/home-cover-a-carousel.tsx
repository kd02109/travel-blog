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
  const [pointerOverPhoto, setPointerOverPhoto] = useState(false);
  const [controlFocused, setControlFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const activeIndex = count ? index % count : 0;
  const nextIndex = count ? (activeIndex + 1) % count : 0;
  const canAutoplay =
    interactive &&
    count > 1 &&
    !paused &&
    !reducedMotion &&
    visible &&
    pageVisible &&
    !pointerOverPhoto &&
    !controlFocused;

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
      className="relative m-0 ml-auto w-full min-w-0"
      onFocusCapture={(event) =>
        setControlFocused(
          (event.target as HTMLElement).dataset.carouselPlay !== "true",
        )
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setControlFocused(false);
      }}
    >
      <div
        className={`${desktop ? "h-[450px]" : "h-[min(36vh,300px)] min-h-72 sm:h-[460px] lg:h-[min(70vh,660px)]"} relative w-full`}
      >
        <div
          className="bg-muted absolute inset-[0_11%_16%_5%] overflow-hidden max-sm:inset-[0_13%_17%_0]"
          onPointerEnter={() => setPointerOverPhoto(true)}
          onPointerLeave={() => setPointerOverPhoto(false)}
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
          {scenes[activeIndex]?.sample && (
            <span className="bg-background/95 text-foreground absolute top-3 left-3 z-10 px-2 py-1 text-[10px]">
              예시 사진
            </span>
          )}
        </div>

        {count > 1 && (
          <>
            {interactive ? (
              <button
                type="button"
                className="bg-surface absolute right-0 bottom-[10%] z-20 h-[31%] w-[35%] cursor-pointer border-[7px] border-[var(--surface)] shadow-[0_8px_24px_rgb(23_60_66_/_17%)]"
                aria-label={`다음 사진 보기: ${scenes[nextIndex]?.label}`}
                onClick={() => move(1)}
              >
                <span
                  className="relative block h-full w-full overflow-hidden"
                  aria-hidden="true"
                >
                  {scenes[nextIndex]?.image}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-[7px] bottom-[7px] bg-gradient-to-t from-[#0b2227]/80 to-transparent px-2 pt-5 pb-2 text-left text-[11px] font-semibold text-white"
                >
                  다음 장면 ↗
                </span>
              </button>
            ) : (
              <div
                className="bg-surface absolute right-0 bottom-[10%] z-20 h-[31%] w-[35%] border-[7px] border-[var(--surface)] shadow-[0_8px_24px_rgb(23_60_66_/_17%)]"
                aria-hidden="true"
              >
                <div className="relative h-full w-full overflow-hidden">
                  {scenes[nextIndex]?.image}
                </div>
              </div>
            )}
          </>
        )}

        <figcaption className="text-muted-foreground absolute bottom-[4%] left-[5%] flex max-w-[calc(100%-160px)] items-center gap-2 text-[11px] tracking-wider whitespace-nowrap max-sm:left-0">
          <strong className="text-foreground shrink-0 text-xs tracking-normal">
            {String(activeIndex + 1).padStart(2, "0")} /{" "}
            {String(count).padStart(2, "0")}
          </strong>
          <span className="truncate">{scenes[activeIndex]?.label}</span>
        </figcaption>

        {interactive && count > 1 && (
          <>
            <div
              className="bg-border absolute bottom-0 left-[5%] h-0.5 w-[49%] overflow-hidden max-sm:left-0 max-sm:w-[46%]"
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
            <div
              role="group"
              aria-label="사진 전환 제어"
              className="absolute right-0 bottom-[1%] z-30 flex items-center gap-1.5"
            >
              <button
                type="button"
                aria-label="이전 사진"
                onClick={() => move(-1)}
                className="border-border bg-surface text-foreground hover:bg-muted grid size-10 place-items-center border transition-colors"
              >
                <ChevronLeft size={19} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="다음 사진"
                onClick={() => move(1)}
                className="border-border bg-surface text-foreground hover:bg-muted grid size-10 place-items-center border transition-colors"
              >
                <ChevronRight size={19} aria-hidden="true" />
              </button>
              {!reducedMotion && (
                <button
                  type="button"
                  data-carousel-play="true"
                  aria-label={
                    paused ? "자동 전환 다시 재생" : "자동 전환 일시정지"
                  }
                  aria-pressed={paused}
                  onClick={() => setPaused((current) => !current)}
                  className="border-border bg-surface text-foreground hover:bg-muted min-h-10 min-w-16 border px-2 text-xs font-semibold whitespace-nowrap transition-colors"
                >
                  {paused ? "재생" : "일시정지"}
                </button>
              )}
            </div>
            <span className="sr-only" aria-live="polite">
              {announcement}
            </span>
          </>
        )}
      </div>
    </figure>
  );
}
