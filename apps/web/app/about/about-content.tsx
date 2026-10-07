"use client";

import { useMemo } from "react";
import type { ActionOutput } from "@repo/contracts";
import { SITE_NAME } from "@repo/constants";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { PublicApiErrorState } from "../public-feedback";
import {
  AboutFeature,
  AboutHeading,
  AboutRecordTypes,
  AboutSiteSkeleton,
} from "./about-presentation";

export function AboutContent({
  initialSite,
  initialError,
}: {
  initialSite?: ActionOutput<"site.get">;
  initialError?: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const site = useTravelQuery(
    api,
    "site.get",
    { slug: "parents-travel" },
    { siteId: "lookup", actor: "public" },
    { initialData: initialSite, staleTime: 0 },
  );
  const settings = site.data?.settings as Record<string, unknown> | undefined;
  const title =
    typeof settings?.title === "string" && settings.title
      ? settings.title
      : (site.data?.name ?? SITE_NAME);
  const description =
    typeof settings?.description === "string" && settings.description
      ? settings.description
      : "천천히 머물고, 오래 기억하는 여행";
  const showInitialError =
    Boolean(initialError) && !site.data && !site.isFetching && !site.error;
  const siteError = site.error ?? (showInitialError ? initialError : undefined);

  return (
    <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-12 md:px-8 md:py-16 xl:px-16">
      <AboutHeading />
      <AboutFeature>
        {!site.data && site.isPending ? (
          <AboutSiteSkeleton />
        ) : (
          <>
            {site.data && (
              <>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {title}
                </p>
                <h2 className="mt-3 max-w-md font-serif text-2xl leading-snug sm:text-3xl">
                  {description}
                </h2>
              </>
            )}
            {siteError && (
              <PublicApiErrorState
                size="small"
                className={site.data ? "mt-5" : undefined}
                error={siteError}
                title="소개 정보를 새로 확인하지 못했어요"
                description={site.error ? undefined : initialError}
                onRetry={() => void site.refetch()}
                isRetrying={site.isFetching}
              />
            )}
          </>
        )}
      </AboutFeature>
      <AboutRecordTypes />
    </main>
  );
}
