"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  HomeCover,
  homeCoverActionClassName,
  homeDesignSamples,
  homeDesignSecondarySamples,
  type HomeTemplate,
} from "@repo/ui/home-cover";

const canvasWidth = 1024;

/** The same desktop cover used on the public home, scaled to a choice card. */
export function HomeCoverThumbnail({ template }: { template: HomeTemplate }) {
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(640);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => setScale(element.clientWidth / canvasWidth);
    resize();
    const measureHeight = () => {
      if (canvas.current) setCanvasHeight(canvas.current.scrollHeight);
    };
    const observer = new ResizeObserver(resize);
    const contentObserver = new ResizeObserver(measureHeight);
    observer.observe(element);
    if (canvas.current) contentObserver.observe(canvas.current);
    measureHeight();
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={viewport}
      aria-hidden="true"
      className="rounded-control bg-background relative aspect-[1024/640] w-full max-w-full min-w-0 overflow-hidden border"
      style={scale ? { height: Math.ceil(canvasHeight * scale) } : undefined}
    >
      <div
        ref={canvas}
        style={{
          width: canvasWidth,
          transform: "scale(" + scale + ")",
          transformOrigin: "top left",
        }}
      >
        <HomeCover
          template={template}
          siteName="오늘도 함께 걷다"
          image={
            <Image
              src={homeDesignSamples[template].src}
              alt={homeDesignSamples[template].alt}
              fill
              sizes="1024px"
              className="object-cover"
            />
          }
          secondaryImages={homeDesignSecondarySamples[template].map(
            (sample) => (
              <Image
                key={sample.src}
                src={sample.src}
                alt={sample.alt}
                fill
                sizes="512px"
                className="object-cover"
              />
            ),
          )}
          secondarySampleImages={homeDesignSecondarySamples[template].map(
            () => true,
          )}
          action={
            <span className={homeCoverActionClassName}>이 여행 펼치기 ↗</span>
          }
          sampleImage
          headingAs="h3"
          headingId={"home-cover-choice-" + template}
          desktop
        />
      </div>
    </div>
  );
}
