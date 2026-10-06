import type { ReactNode } from "react";
import { HomeCoverACarousel } from "./home-cover-a-carousel";

export type HomeTemplate = "A" | "B" | "C" | "D";

export const homeDesignSamples: Record<
  HomeTemplate,
  { src: string; alt: string }
> = {
  A: { src: "/home-design/kyoto.jpg", alt: "교토의 저녁 골목 예시 사진" },
  B: {
    src: "/home-design/dolomites.jpg",
    alt: "돌로미티 산맥의 노을 예시 사진",
  },
  C: { src: "/home-design/jeju.jpg", alt: "제주의 바다와 해변 예시 사진" },
  D: {
    src: "/home-design/santorini.jpg",
    alt: "산토리니의 바다와 마을 예시 사진",
  },
};

/** Ordered sample scenes for layouts with more than one photograph. */
export const homeDesignSecondarySamples: Record<
  HomeTemplate,
  readonly { src: string; alt: string }[]
> = {
  A: [
    { src: "/home-design/jeju.jpg", alt: "제주의 해변 예시 사진" },
    { src: "/home-design/dolomites.jpg", alt: "돌로미티의 산 예시 사진" },
    { src: "/home-design/santorini.jpg", alt: "산토리니의 마을 예시 사진" },
  ],
  B: [
    { src: "/home-design/jeju.jpg", alt: "제주의 바다 예시 사진" },
    { src: "/home-design/kyoto.jpg", alt: "교토의 골목 예시 사진" },
    { src: "/home-design/santorini.jpg", alt: "산토리니의 바다 예시 사진" },
  ],
  C: [
    { src: "/home-design/kyoto.jpg", alt: "교토의 골목 예시 사진" },
    { src: "/home-design/dolomites.jpg", alt: "돌로미티의 산 예시 사진" },
    { src: "/home-design/santorini.jpg", alt: "산토리니의 마을 예시 사진" },
  ],
  D: [],
};

function PhotoSlot({
  image,
  sample = false,
  compact = false,
  className,
}: {
  image?: ReactNode;
  sample?: boolean;
  compact?: boolean;
  className: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {image ?? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(145deg,#a9c1bb,#e8ece3_52%,#72959a)]"
        />
      )}
      {image && sample && (
        <span
          className={
            compact
              ? "bg-background/95 text-foreground absolute bottom-1 left-1 z-10 px-1 py-0.5 text-[9px]"
              : "rounded-control bg-background/95 text-foreground absolute bottom-3 left-3 z-10 px-2 py-1 text-xs"
          }
        >
          {compact ? "예시" : "예시 사진"}
        </span>
      )}
    </div>
  );
}

export const homeCoverActionClassName =
  "rounded-control bg-primary text-primary-foreground mt-7 inline-flex min-h-12 items-center justify-center px-6 text-base font-medium transition-colors hover:bg-[var(--primary-hover)]";

export function resolveHomeTemplate(value: unknown): HomeTemplate {
  return value === "A" || value === "B" || value === "C" || value === "D"
    ? value
    : "D";
}

export function HomeCover({
  template,
  title,
  description,
  siteName,
  image,
  secondaryImages = [],
  action,
  sampleImage = false,
  secondarySampleImages = [],
  headingAs = "h1",
  headingId = "postcard-title",
  desktop = false,
}: {
  template: HomeTemplate;
  title?: string | null;
  description?: string | null;
  siteName: string;
  image: ReactNode;
  /** Up to three additional scenes, in the order chosen in Home Design. */
  secondaryImages?: readonly ReactNode[];
  action: ReactNode;
  sampleImage?: boolean;
  secondarySampleImages?: readonly boolean[];
  headingAs?: "h1" | "h3";
  headingId?: string;
  /** Render the desktop layout inside a scaled design-choice thumbnail. */
  desktop?: boolean;
}) {
  const Heading = headingAs;
  const headline = title || (
    <>
      천천히 머물고,
      <br className="hidden sm:block" /> 오래 기억하는 여행
    </>
  );
  const summary = description || `${siteName}의 여행책을 한 장씩 펼쳐 보세요.`;
  const photo = (
    <div className="absolute inset-0">
      {image}
      {sampleImage && (
        <span className="rounded-control bg-background/95 text-foreground absolute bottom-3 left-3 z-10 px-2 py-1 text-xs">
          예시 사진
        </span>
      )}
    </div>
  );
  const copy = (
    <div
      className={`rounded-postcard border-border bg-background relative z-10 border shadow-[0_12px_32px_rgb(23_60_66_/_14%)] ${desktop ? "p-12" : "p-6 sm:p-10 lg:p-12"}`}
    >
      <p className="text-muted-foreground text-sm font-medium tracking-[0.16em]">
        POSTCARD / 오늘의 여행
      </p>
      <Heading
        id={headingId}
        className={`mt-5 font-serif leading-[1.35] ${desktop ? "text-5xl" : "text-[clamp(2rem,5vw,3rem)]"}`}
      >
        {title ? (
          title
        ) : (
          <>
            천천히 머물고,
            <br className="hidden sm:block" /> 오래 기억하는 여행
          </>
        )}
      </Heading>
      <p className="text-muted-foreground mt-5 max-w-md text-base leading-relaxed">
        {description || `${siteName}의 여행책을 한 장씩 펼쳐 보세요.`}
      </p>
      {action}
    </div>
  );

  if (template === "D")
    return (
      <section
        data-home-template={template}
        aria-labelledby={headingId}
        className={`rounded-panel border-border bg-surface relative grid items-end overflow-hidden border ${desktop ? "min-h-[540px] grid-cols-[1.2fr_0.8fr] items-center p-12" : "min-h-[min(68vh,640px)] p-4 sm:min-h-[540px] sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:p-12"}`}
      >
        <div
          className={`rounded-postcard absolute overflow-hidden ${desktop ? "inset-8" : "inset-4 sm:inset-8"}`}
        >
          {photo}
        </div>
        {secondaryImages.length > 0 && (
          <div
            className={`bg-background/90 absolute z-10 flex gap-2 border border-white/70 p-2 ${desktop ? "bottom-14 left-14" : "top-7 left-7 sm:top-auto sm:bottom-12 sm:left-12"}`}
            aria-label="여행의 다른 장면"
          >
            {secondaryImages.slice(0, 3).map((scene, index) => (
              <PhotoSlot
                key={index}
                image={scene}
                sample={false}
                className="bg-muted size-12 sm:size-16"
              />
            ))}
            {secondarySampleImages
              .slice(0, secondaryImages.length)
              .some(Boolean) && (
              <span className="bg-background/95 text-foreground absolute -top-6 right-0 px-2 py-0.5 text-[10px]">
                예시 사진 포함
              </span>
            )}
          </div>
        )}
        <div
          className={`relative z-10 ${desktop ? "col-start-2 row-start-1 my-10 mr-2 ml-auto max-w-xl" : "mb-2 sm:mb-5 sm:ml-auto sm:max-w-xl lg:col-start-2 lg:row-start-1 lg:my-10 lg:mr-2"}`}
        >
          {copy}
        </div>
      </section>
    );

  if (template === "A") {
    const sampleCaptions = [
      "교토의 저녁 골목",
      "제주의 바다와 해변",
      "돌로미티의 산맥",
      "산토리니 바다와 마을",
    ];
    const scenes = [
      {
        image,
        sample: sampleImage,
        label: sampleImage ? sampleCaptions[0]! : "여행의 첫 장면",
      },
      ...secondaryImages.slice(0, 3).map((scene, index) => ({
        image: scene,
        sample: !!secondarySampleImages[index],
        label: secondarySampleImages[index]
          ? sampleCaptions[index + 1]!
          : `여행의 ${index + 2}번째 장면`,
      })),
    ];
    return (
      <section
        data-home-template={template}
        aria-labelledby={headingId}
        className={`bg-background text-foreground relative isolate grid overflow-hidden ${desktop ? "min-h-[540px] grid-cols-[52%_48%] grid-rows-[minmax(0,1fr)_auto]" : "min-h-[min(68vh,640px)] grid-rows-[auto_minmax(260px,1fr)_auto] lg:grid-cols-[52%_48%] lg:grid-rows-[minmax(0,1fr)_auto]"}`}
      >
        <div
          className={`relative z-10 flex min-w-0 flex-col items-start justify-center ${desktop ? "px-14 py-12" : "px-6 pt-10 pb-8 sm:px-10 sm:pt-14 sm:pb-10 lg:px-[clamp(3rem,6vw,8rem)] lg:py-16"}`}
        >
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.15em]">
            {siteName} / TRAVEL JOURNAL
          </p>
          <Heading
            id={headingId}
            className={`mt-7 max-w-[13ch] font-serif leading-[1.22] tracking-[-0.045em] break-keep ${desktop ? "text-[clamp(2.5rem,4vw,3.75rem)]" : "text-[clamp(2.15rem,4vw,4.25rem)] lg:mt-10"}`}
          >
            {headline}
          </Heading>
          <p className="text-muted-foreground mt-4 max-w-md text-sm leading-relaxed sm:mt-5 sm:text-base">
            {summary}
          </p>
          <div className="[&_a]:mt-6 [&_a]:rounded-none">{action}</div>
          <span className="text-muted-foreground mt-auto hidden pt-8 text-xs tracking-[0.06em] lg:block">
            01 — 사진으로 남긴 여행의 장면
          </span>
        </div>
        <HomeCoverACarousel
          scenes={scenes}
          interactive={!desktop}
          desktop={desktop}
        />
        <div className="bg-primary text-primary-foreground col-span-full flex min-h-14 items-center justify-between gap-4 px-6 py-3 text-xs sm:px-10 lg:px-[clamp(3rem,6vw,8rem)]">
          <span className="font-semibold tracking-[0.14em]">
            SCROLL TO EXPLORE
          </span>
          <span>함께한 여행의 장면 ↓</span>
        </div>
      </section>
    );
  }

  if (template === "B") {
    const scenes = [image, ...secondaryImages.slice(0, 3)];
    const samples = [sampleImage, ...secondarySampleImages.slice(0, 3)];
    const upper = scenes.length >= 4 ? scenes.slice(0, 2) : scenes.slice(0, 1);
    const lower = scenes.length >= 4 ? scenes.slice(2, 4) : scenes.slice(1, 3);
    const lowerStart = scenes.length >= 4 ? 2 : 1;
    return (
      <section
        data-home-template={template}
        aria-labelledby={headingId}
        className={`relative isolate flex items-center overflow-hidden bg-[#173c42] text-white ${desktop ? "min-h-[540px]" : "min-h-[min(68vh,640px)]"}`}
      >
        <div
          className={`absolute inset-0 grid gap-1.5 ${scenes.length === 1 ? "grid-rows-1" : "grid-rows-2"}`}
          aria-hidden="true"
        >
          <div
            className={`grid min-h-0 gap-1.5 ${upper.length > 1 ? "grid-cols-[1.65fr_0.85fr]" : "grid-cols-1"}`}
          >
            {upper.map((scene, index) => (
              <PhotoSlot
                key={index}
                image={scene}
                sample={samples[index]}
                className="h-full min-w-0"
              />
            ))}
          </div>
          {lower.length > 0 && (
            <div
              className={`grid min-h-0 gap-1.5 ${lower.length > 1 ? "grid-cols-[0.85fr_1.65fr]" : "grid-cols-1"}`}
            >
              {lower.map((scene, index) => (
                <PhotoSlot
                  key={index}
                  image={scene}
                  sample={samples[lowerStart + index]}
                  className="h-full min-w-0"
                />
              ))}
            </div>
          )}
          <div className="absolute inset-0 bg-[#102d32]/25" />
        </div>
        <div className="relative z-10 w-full bg-[#173c42]/95 px-6 py-8 sm:px-10 lg:px-[clamp(3rem,8vw,9rem)] lg:py-10">
          <div
            className={`grid items-center gap-6 ${desktop ? "grid-cols-[1.25fr_0.75fr]" : "lg:grid-cols-[1.25fr_0.75fr]"}`}
          >
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-white/75">
                BETWEEN LAND & WATER / 02
              </p>
              <Heading
                id={headingId}
                className={`mt-3 max-w-[17ch] font-serif leading-[1.2] break-keep ${desktop ? "text-[3.25rem]" : "text-[clamp(2.35rem,5vw,4.5rem)]"}`}
              >
                {headline}
              </Heading>
            </div>
            <div className="border-t border-white/35 pt-4 lg:border-t-0 lg:border-l lg:py-3 lg:pl-8">
              <p className="max-w-sm text-base leading-relaxed text-white/80">
                {summary}
              </p>
              <div className="[&_a]:!border [&_a]:!border-white [&_a]:!bg-transparent [&_a]:!text-white [&_a:hover]:!bg-white/10 [&_span]:!border [&_span]:!border-white [&_span]:!bg-transparent [&_span]:!text-white">
                {action}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const scenes = [image, ...secondaryImages.slice(0, 3)];
  const samples = [sampleImage, ...secondarySampleImages.slice(0, 3)];
  const sceneHeights = desktop
    ? ["h-64", "h-80", "h-60", "h-72"]
    : [
        "h-44 sm:h-60 lg:h-64",
        "h-40 sm:h-72 lg:h-80",
        "h-40 sm:h-56 lg:h-60",
        "h-40 sm:h-64 lg:h-72",
      ];
  const sceneGrid = desktop
    ? scenes.length === 1
      ? "max-w-[70%] grid-cols-1"
      : scenes.length === 2
        ? "grid-cols-2"
        : scenes.length === 4
          ? "grid-cols-4"
          : "grid-cols-3"
    : scenes.length === 1
      ? "max-w-xl grid-cols-1"
      : scenes.length === 2
        ? "grid-cols-2"
        : scenes.length === 4
          ? "grid-cols-2 lg:grid-cols-4"
          : "grid-cols-2 lg:grid-cols-3";
  return (
    <section
      data-home-template={template}
      aria-labelledby={headingId}
      className={`text-foreground relative isolate overflow-hidden bg-[#e8ece3] ${desktop ? "min-h-[540px] px-12 py-9" : "min-h-[min(68vh,640px)] px-5 py-8 sm:px-10 lg:px-[clamp(3rem,7vw,8rem)] lg:py-10"}`}
    >
      <div
        className={`relative z-10 grid items-end gap-4 ${desktop ? "grid-cols-[1.4fr_0.6fr]" : "lg:grid-cols-[1.4fr_0.6fr]"}`}
      >
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em]">
            ON THE ROAD / ROUTE 03
          </p>
          <Heading
            id={headingId}
            className={`mt-3 max-w-[16ch] font-serif leading-[1.18] break-keep ${desktop ? "text-[3.3rem]" : "text-[clamp(2.35rem,5vw,4.25rem)]"}`}
          >
            {headline}
          </Heading>
        </div>
        <div>
          <p className="text-muted-foreground max-w-sm text-base leading-relaxed">
            {summary}
          </p>
          {action}
        </div>
      </div>
      <div className="relative mt-8 lg:mt-10">
        <svg
          aria-hidden="true"
          viewBox="0 0 1200 300"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full text-[#6f8d89]"
        >
          <path
            d="M 20 205 C 170 225, 240 12, 390 78 S 630 305, 800 160 S 1030 60, 1180 120"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="6 9"
          />
        </svg>
        <div
          className={`relative z-10 grid items-start gap-3 sm:gap-5 ${sceneGrid}`}
        >
          {scenes.map((scene, index) => (
            <figure
              key={index}
              className={`m-0 min-w-0 ${index === 0 && scenes.length === 3 && !desktop ? "col-span-2 lg:col-span-1" : ""} ${desktop ? (index % 2 ? "mt-8" : "") : index % 2 ? "lg:mt-8" : ""}`}
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-widest">
                <span className="bg-background grid size-7 place-items-center rounded-full border border-[#6f8d89] tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>SCENE</span>
              </div>
              <PhotoSlot
                image={scene}
                sample={samples[index]}
                className={`bg-muted w-full ${sceneHeights[index]}`}
              />
              <figcaption className="text-muted-foreground mt-2 text-xs">
                {index + 1}번째 여행 장면
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
