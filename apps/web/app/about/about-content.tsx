"use client";
import { useMemo } from "react";
import type { ActionOutput } from "@repo/contracts";
import { SITE_NAME } from "@repo/constants";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { errorMessage } from "@repo/api-client";
import { ErrorState } from "@repo/ui/feedback";

export function AboutContent({ initialSite }: { initialSite?: ActionOutput<"site.get"> }) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const site = useTravelQuery(api, "site.get", { slug: "parents-travel" }, { siteId: "lookup", actor: "public" }, { initialData: initialSite });
  const settings = site.data?.settings as Record<string, unknown> | undefined;
  const title = typeof settings?.title === "string" && settings.title ? settings.title : site.data?.name ?? SITE_NAME;
  const description = typeof settings?.description === "string" && settings.description ? settings.description : "풍경을 보고, 음식을 맛보고, 골목을 걸으며 여행에서 만난 장면을 기록합니다.";
  return <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-12 md:px-8 md:py-16 xl:px-16"><p className="text-muted-foreground text-sm tracking-widest">OUR STORY</p><h1 className="mt-3 font-serif text-3xl leading-[1.35] sm:text-4xl">우리의 기록</h1>{site.error ? <div className="mt-8"><ErrorState description={errorMessage(site.error)} onRetry={() => void site.refetch()} /></div> : <section className="rounded-panel border-border bg-surface mt-8 max-w-[var(--article-max)] border p-6 sm:p-8"><h2 className="font-serif text-2xl">{title}</h2><p className="mt-4 text-lg leading-[1.8]">{description}</p></section>}</main>;
}
