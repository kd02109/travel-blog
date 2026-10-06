"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { TravelApiError, errorMessage } from "@repo/api-client";
import type { ActionInput } from "@repo/contracts";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Select } from "@repo/ui/select";
import { Dialog } from "@repo/ui/dialog";
import {
  HomeCover,
  homeCoverActionClassName,
  homeDesignSamples,
  homeDesignSecondarySamples,
  resolveHomeTemplate,
} from "@repo/ui/home-cover";
import { MediaUpload } from "../media-upload";
import { PrivateAssetView } from "../asset-view";
import { HomeCoverThumbnail } from "./home-cover-thumbnail";

type SiteSettings = ActionInput<"admin.settings.save">["settings"];
const maxHomeImages = 4;

function homeImageIds(settings: Record<string, unknown> | undefined): string[] {
  if (Array.isArray(settings?.hero_asset_ids))
    return [
      ...new Set(
        settings.hero_asset_ids.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ].slice(0, maxHomeImages);
  return typeof settings?.hero_asset_id === "string" && settings.hero_asset_id
    ? [settings.hero_asset_id]
    : [];
}

const templates = [
  {
    id: "A",
    name: "여백의 여행책",
    description: "여백과 세로 사진으로 펼치는 기록",
  },
  {
    id: "B",
    name: "숲과 물 사이",
    description: "풍경과 깊은 초록을 담는 표지",
  },
  {
    id: "C",
    name: "길을 따라",
    description: "여행의 장면을 따라 읽는 구성",
  },
  {
    id: "D",
    name: "한 장의 엽서",
    description: "큰 풍경 사진과 종이 엽서",
  },
] as const;

export function HomeDesignEditor({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const me = useTravelQuery(api, "me", {}, { siteId, actor: "session" });
  const owner =
    me.data?.memberships.some(
      (membership) =>
        membership.site_id === siteId && membership.role === "owner",
    ) ?? false;
  const scope = { siteId, actor: me.data?.user_id ?? "session" };
  const settings = useTravelQuery(
    api,
    "admin.settings.get",
    { site_id: siteId },
    scope,
    { enabled: owner },
  );
  const publishedPosts = useTravelQuery(
    api,
    "admin.posts",
    { site_id: siteId, status: "published", limit: 50, offset: 0 },
    scope,
    { enabled: owner },
  );
  const recentPosts = useTravelQuery(
    api,
    "posts.list",
    { site_id: siteId, limit: 6, offset: 0 },
    { siteId, actor: "public" },
    { enabled: owner },
  );
  const saveSettings = useTravelMutation(api, "admin.settings.save", scope);
  const applySettings = useTravelMutation(api, "admin.settings.apply", scope);
  const [draft, setDraft] = useState<Record<string, unknown>>();
  const [version, setVersion] = useState<number>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processingImages, setProcessingImages] = useState(false);
  const [applyDialog, setApplyDialog] = useState(false);
  const [feedback, setFeedback] = useState("");
  const current = settings.data?.published as
    Record<string, unknown> | undefined;
  const draftSettings =
    draft ?? (settings.data?.draft as Record<string, unknown> | undefined);
  const currentVersion = version ?? settings.data?.version ?? 0;
  const featuredId =
    typeof draftSettings?.featured_post_id === "string"
      ? draftSettings.featured_post_id
      : "";
  const featuredInRecent = recentPosts.data?.find(
    (post) => post.post_id === featuredId,
  );
  const featuredInAdmin = publishedPosts.data?.find(
    (post) => post.id === featuredId,
  );
  const featuredDetail = useTravelQuery(
    api,
    "post.get",
    { site_id: siteId, id: featuredId || siteId },
    { siteId, actor: "public" },
    {
      enabled: Boolean(
        owner && featuredId && recentPosts.data && !featuredInRecent,
      ),
    },
  );

  function update(key: string, value: string | null) {
    setDraft((previous) => ({
      ...(previous ?? (settings.data?.draft as Record<string, unknown>) ?? {}),
      [key]: value,
    }));
    setDirty(true);
    setFeedback("");
  }

  function updateHomeImages(ids: string[]) {
    setDraft((previous) => ({
      ...(previous ?? (settings.data?.draft as Record<string, unknown>) ?? {}),
      hero_asset_ids: ids,
      hero_asset_id: ids[0] ?? null,
    }));
    setDirty(true);
    setFeedback("");
  }

  function addHomeImage(assetId: string) {
    setDraft((previous) => {
      const base =
        previous ?? (settings.data?.draft as Record<string, unknown>) ?? {};
      const ids = homeImageIds(base);
      if (ids.includes(assetId) || ids.length >= maxHomeImages) return base;
      const next = [...ids, assetId];
      return { ...base, hero_asset_ids: next, hero_asset_id: next[0] };
    });
    setDirty(true);
    setFeedback("");
  }

  async function save() {
    if (!draftSettings) return;
    const saved = await saveSettings.submit({
      site_id: siteId,
      version: currentVersion,
      settings: draftSettings as SiteSettings,
    });
    setDraft(draftSettings);
    setVersion(saved.version);
    setDirty(false);
    return saved.version;
  }

  async function apply() {
    if (!draftSettings) return;
    setBusy(true);
    setFeedback("");
    try {
      let nextVersion = currentVersion;
      if (dirty) nextVersion = (await save()) ?? nextVersion;
      const result = await applySettings.submit({
        site_id: siteId,
        version: nextVersion,
      });
      setVersion(result.version);
      setDirty(false);
      setApplyDialog(false);
      setFeedback("선택한 홈 디자인을 공개 사이트에 적용했습니다.");
      await settings.refetch();
    } catch (error) {
      setFeedback(
        error instanceof TravelApiError
          ? errorMessage(error)
          : "적용하지 못했습니다. 초안은 화면에 보존되어 있습니다.",
      );
      if (error instanceof TravelApiError && error.status === 409)
        void settings.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (me.isPending)
    return (
      <main className="mx-auto max-w-6xl px-5 py-12" role="status">
        관리자 권한을 확인하고 있어요…
      </main>
    );
  if (me.isError)
    return (
      <main className="mx-auto max-w-6xl px-5 py-12" role="alert">
        {errorMessage(me.error)}{" "}
        <Button variant="outline" onClick={() => void me.refetch()}>
          다시 확인
        </Button>
      </main>
    );
  if (!owner)
    return (
      <main className="mx-auto max-w-6xl px-5 py-12">
        <h1 className="text-3xl font-semibold">홈 디자인</h1>
        <p className="mt-4" role="alert">
          홈 디자인 변경은 사이트 owner만 할 수 있습니다.
        </p>
      </main>
    );
  if (settings.isError)
    return (
      <main className="mx-auto max-w-6xl space-y-3 px-5 py-12" role="alert">
        <p>{errorMessage(settings.error)}</p>
        <Button variant="outline" onClick={() => void settings.refetch()}>
          다시 불러오기
        </Button>
      </main>
    );
  if (settings.isPending || !draftSettings)
    return (
      <main className="mx-auto max-w-6xl px-5 py-12" role="status">
        홈 설정을 불러오고 있어요…
      </main>
    );

  const selected = resolveHomeTemplate(draftSettings.template_id);
  const publishedTemplate = resolveHomeTemplate(current?.template_id);
  const selectedImageIds = homeImageIds(draftSettings);
  const previewAssetId = selectedImageIds[0] ?? "";
  const previewImage = previewAssetId ? (
    <PrivateAssetView
      assetId={previewAssetId}
      siteId={siteId}
      kind="image"
      title="홈 첫 번째 사진 미리보기"
      className="h-full max-h-none min-h-0 w-full rounded-none object-cover"
    />
  ) : (
    <Image
      src={homeDesignSamples[selected].src}
      alt={homeDesignSamples[selected].alt}
      fill
      sizes="(max-width: 768px) 100vw, 70vw"
      className="object-cover"
    />
  );
  const previewSecondaryImages = selectedImageIds.length
    ? selectedImageIds
        .slice(1)
        .map((assetId, index) => (
          <PrivateAssetView
            key={assetId}
            assetId={assetId}
            siteId={siteId}
            kind="image"
            title={`홈 ${index + 2}번째 사진 미리보기`}
            className="h-full max-h-none min-h-0 w-full rounded-none object-cover"
          />
        ))
    : homeDesignSecondarySamples[selected].map((sample) => (
        <Image
          key={sample.src}
          src={sample.src}
          alt={sample.alt}
          fill
          sizes="(max-width: 768px) 100vw, 45vw"
          className="object-cover"
        />
      ));
  const previewSecondarySampleImages = previewSecondaryImages.map(
    () => selectedImageIds.length === 0,
  );
  const featuredTitle = featuredId
    ? (featuredInRecent?.title ??
      featuredDetail.data?.title ??
      (featuredDetail.isPending ? undefined : recentPosts.data?.[0]?.title))
    : recentPosts.data?.[0]?.title;
  const previewAction = (
    <span className={homeCoverActionClassName}>
      {featuredTitle ? featuredTitle + " 읽기 ↗" : "이 여행 펼치기 ↗"}
    </span>
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-10 md:px-8 md:py-14">
      <header>
        <p className="text-muted-foreground text-sm tracking-widest">
          SITE APPEARANCE
        </p>
        <h1 className="mt-2 text-3xl font-semibold">홈 디자인</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl">
          디자인과 문구를 고르면 아래에 공개 홈의 실제 표지가 표시됩니다.
          방문자에게 보이게 하려면 적용을 눌러 주세요.
        </p>
      </header>

      {feedback && (
        <p role="status" aria-live="polite">
          {feedback}
        </p>
      )}

      <section aria-labelledby="templates-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="templates-heading" className="text-xl font-semibold">
            표지 고르기
          </h2>
          <p className="text-muted-foreground text-sm">
            각 표지는 실제 웹 화면을 축소해 보여줍니다.
          </p>
        </div>
        <ul className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className={
                "rounded-panel bg-surface hover:border-primary focus-within:ring-ring relative min-w-0 border p-4 transition-colors focus-within:ring-2 " +
                (selected === template.id
                  ? "border-primary ring-primary/20 ring-2"
                  : "border-border")
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-semibold">
                  {template.id} · {template.name}
                </span>
                <span className="flex flex-wrap gap-2 text-xs">
                  {selected === template.id && (
                    <span className="rounded-control bg-primary text-primary-foreground px-2 py-1">
                      선택됨
                    </span>
                  )}
                  {publishedTemplate === template.id && (
                    <span className="rounded-control bg-muted px-2 py-1">
                      공개 중
                    </span>
                  )}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 mb-4 text-sm">
                {template.description}
              </p>
              <HomeCoverThumbnail template={template.id} />
              <button
                type="button"
                aria-label={template.id + " · " + template.name + " 선택"}
                aria-pressed={selected === template.id}
                onClick={() => update("template_id", template.id)}
                className="rounded-panel focus-visible:outline-ring absolute inset-0 cursor-pointer focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2"
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="preview-heading" className="space-y-4">
        <div>
          <h2 id="preview-heading" className="text-xl font-semibold">
            초안 미리보기
          </h2>
          <p className="text-muted-foreground mt-1">
            선택한 디자인·문구·사진이 공개 홈 상단에 표시되는 모습입니다. 적용
            전까지 공개 사이트는 바뀌지 않습니다.
          </p>
        </div>
        <div className="rounded-panel bg-background overflow-hidden border">
          <div className="bg-surface border-b px-5 py-3 text-sm">
            <span className="font-medium">{siteName}</span>
            <span className="text-muted-foreground ml-3">/ 홈 미리보기</span>
          </div>
          <div className="mx-auto w-full max-w-[var(--content-max)] px-5 py-10 md:px-8 md:py-16 xl:px-16">
            <HomeCover
              template={selected}
              title={
                typeof draftSettings.title === "string"
                  ? draftSettings.title
                  : undefined
              }
              description={
                typeof draftSettings.description === "string"
                  ? draftSettings.description
                  : undefined
              }
              siteName={siteName}
              image={previewImage}
              secondaryImages={previewSecondaryImages}
              secondarySampleImages={previewSecondarySampleImages}
              action={previewAction}
              sampleImage={!previewAssetId}
              headingAs="h3"
              headingId="home-draft-preview-title"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block space-y-2">
          홈 제목
          <Input
            value={
              typeof draftSettings.title === "string" ? draftSettings.title : ""
            }
            maxLength={150}
            onChange={(event) => update("title", event.currentTarget.value)}
          />
        </label>
        <label className="block space-y-2">
          홈 소개
          <Input
            value={
              typeof draftSettings.description === "string"
                ? draftSettings.description
                : ""
            }
            maxLength={500}
            onChange={(event) =>
              update("description", event.currentTarget.value)
            }
          />
        </label>
      </div>

      <label className="block max-w-2xl space-y-2">
        대표 여행 글
        <Select
          value={
            typeof draftSettings.featured_post_id === "string"
              ? draftSettings.featured_post_id
              : ""
          }
          onChange={(event) =>
            update("featured_post_id", event.currentTarget.value || null)
          }
        >
          <option value="">최근 공개 글 사용</option>
          {featuredId && !featuredInAdmin && (
            <option value={featuredId}>
              {featuredInRecent?.title ??
                featuredDetail.data?.title ??
                (featuredDetail.isError
                  ? "선택한 글을 찾을 수 없음"
                  : "선택한 글 불러오는 중…")}
            </option>
          )}
          {(publishedPosts.data ?? []).map((post) => (
            <option value={post.id} key={post.id}>
              {post.title || "제목 없는 글"}
            </option>
          ))}
        </Select>
      </label>

      <section className="space-y-4" aria-labelledby="home-images-heading">
        <div>
          <div className="flex items-center gap-3">
            <h2 id="home-images-heading" className="text-xl font-semibold">
              홈 사진
            </h2>
            <span className="text-muted-foreground text-sm">
              {selectedImageIds.length} / {maxHomeImages}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            최대 {maxHomeImages}장을 순서대로 배치합니다. 첫 번째 사진이 표지의
            중심이 되고, 나머지는 선택한 디자인의 사진 구성에 함께 나타납니다.
            사진이 없으면 예시 사진이 표시됩니다.
          </p>
        </div>
        {selectedImageIds.length > 0 && (
          <ul
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="홈 사진 순서"
          >
            {selectedImageIds.map((assetId, index) => (
              <li
                key={assetId}
                className="rounded-panel bg-surface min-w-0 overflow-hidden border"
              >
                <div className="bg-muted aspect-[4/3] overflow-hidden">
                  <PrivateAssetView
                    assetId={assetId}
                    siteId={siteId}
                    kind="image"
                    title={`홈 사진 ${index + 1}`}
                    className="h-full max-h-none w-full rounded-none object-cover"
                  />
                </div>
                <div className="space-y-3 p-3">
                  <p className="font-medium">
                    {index + 1}번째 사진{index === 0 ? " · 중심 사진" : ""}
                  </p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...selectedImageIds];
                        [next[index - 1], next[index]] = [
                          next[index]!,
                          next[index - 1]!,
                        ];
                        updateHomeImages(next);
                      }}
                      className="rounded-control border px-3 py-1.5 disabled:opacity-40"
                      aria-label={`${index + 1}번째 사진을 앞으로 이동`}
                    >
                      앞으로
                    </button>
                    <button
                      type="button"
                      disabled={index === selectedImageIds.length - 1}
                      onClick={() => {
                        const next = [...selectedImageIds];
                        [next[index], next[index + 1]] = [
                          next[index + 1]!,
                          next[index]!,
                        ];
                        updateHomeImages(next);
                      }}
                      className="rounded-control border px-3 py-1.5 disabled:opacity-40"
                      aria-label={`${index + 1}번째 사진을 뒤로 이동`}
                    >
                      뒤로
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateHomeImages(
                          selectedImageIds.filter((id) => id !== assetId),
                        )
                      }
                      className="rounded-control border px-3 py-1.5"
                      aria-label={`${index + 1}번째 사진을 홈에서 제거`}
                    >
                      제거
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-sm">
          여러 장을 한 번에 올릴 수 있습니다. 처리가 끝난 사진은 위 목록에
          자동으로 추가되며, 사진을 제거한 뒤 다시 추가할 수도 있습니다.
        </p>
        {selectedImageIds.length >= maxHomeImages && (
          <p className="text-sm" role="status">
            사진 네 장을 모두 선택했습니다. 다른 사진을 쓰려면 위에서 한 장을
            제거해 주세요.
          </p>
        )}
        <MediaUpload
          siteId={siteId}
          kindFilter="image"
          onImageReady={addHomeImage}
          onProcessingChange={setProcessingImages}
          onSetCoverImage={addHomeImage}
          coverActionLabel="홈 사진에 추가"
          coverActionDisabled={selectedImageIds.length >= maxHomeImages}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={busy || processingImages || !dirty}
          onClick={() => {
            setBusy(true);
            void save()
              .then(() => setFeedback("홈 디자인 초안을 저장했습니다."))
              .catch((error: unknown) =>
                setFeedback(
                  error instanceof TravelApiError
                    ? errorMessage(error)
                    : "초안을 저장하지 못했습니다.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "저장 중…" : processingImages ? "사진 처리 중…" : "초안 저장"}
        </Button>
        <Button
          disabled={busy || processingImages}
          onClick={() => setApplyDialog(true)}
        >
          {processingImages ? "사진 처리 중…" : "공개 홈에 적용"}
        </Button>
      </div>
      <Dialog
        open={applyDialog}
        onOpenChange={setApplyDialog}
        title="공개 홈에 적용할까요?"
        description="현재 미리보기의 제목, 사진, 추천 글과 표지 구성이 방문자에게 공개됩니다."
      >
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setApplyDialog(false)}
          >
            취소
          </Button>
          <Button
            disabled={busy || processingImages}
            onClick={() => void apply()}
          >
            {busy ? "적용 중…" : "공개 홈에 적용"}
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
