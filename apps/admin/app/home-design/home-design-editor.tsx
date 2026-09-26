"use client";
import { useMemo, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { TravelApiError, errorMessage } from "@repo/api-client";
import type { ActionInput } from "@repo/contracts";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Select } from "@repo/ui/select";
import { Dialog } from "@repo/ui/dialog";
import { MediaUpload } from "../media-upload";
import { PrivateAssetView } from "../asset-view";

type SiteSettings = ActionInput<"admin.settings.save">["settings"];
const templates = [
  { id: "A", name: "여백의 여행책", description: "여백과 세로 사진으로 펼치는 기록" },
  { id: "B", name: "숲과 물 사이", description: "풍경과 깊은 초록을 담는 표지" },
  { id: "C", name: "길을 따라", description: "여행의 장면을 따라 읽는 구성" },
  { id: "D", name: "한 장의 엽서", description: "큰 풍경 사진과 종이 엽서" },
] as const;

export function HomeDesignEditor({ siteId }: { siteId: string }) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const me = useTravelQuery(api, "me", {}, { siteId, actor: "session" });
  const owner = me.data?.memberships.some((membership) => membership.site_id === siteId && membership.role === "owner") ?? false;
  const scope = { siteId, actor: me.data?.user_id ?? "session" };
  const settings = useTravelQuery(api, "admin.settings.get", { site_id: siteId }, scope, { enabled: owner });
  const publishedPosts = useTravelQuery(api, "admin.posts", { site_id: siteId, status: "published", limit: 50, offset: 0 }, scope, { enabled: owner });
  const saveSettings = useTravelMutation(api, "admin.settings.save", scope);
  const applySettings = useTravelMutation(api, "admin.settings.apply", scope);
  const [draft, setDraft] = useState<Record<string, unknown>>();
  const [version, setVersion] = useState<number>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applyDialog, setApplyDialog] = useState(false);
  const [feedback, setFeedback] = useState("");
  const current = settings.data?.published as Record<string, unknown> | undefined;

  const draftSettings = draft ?? settings.data?.draft as Record<string, unknown> | undefined;
  const currentVersion = version ?? settings.data?.version ?? 0;

  function update(key: string, value: string | null) {
    setDraft((previous) => ({ ...(previous ?? settings.data?.draft as Record<string, unknown> ?? {}), [key]: value }));
    setDirty(true);
    setFeedback("");
  }

  async function save() {
    if (!draftSettings) return;
    const saved = await saveSettings.submit({ site_id: siteId, version: currentVersion, settings: draftSettings as SiteSettings });
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
      const result = await applySettings.submit({ site_id: siteId, version: nextVersion });
      setVersion(result.version);
      setDirty(false);
      setApplyDialog(false);
      setFeedback("선택한 홈 디자인을 공개 사이트에 적용했습니다.");
      await settings.refetch();
    } catch (error) {
      setFeedback(error instanceof TravelApiError ? errorMessage(error) : "적용하지 못했습니다. 초안은 화면에 보존되어 있습니다.");
      if (error instanceof TravelApiError && error.status === 409) void settings.refetch();
    } finally { setBusy(false); }
  }

  if (me.isPending) return <main className="mx-auto max-w-6xl px-5 py-12" role="status">관리자 권한을 확인하고 있어요…</main>;
  if (me.isError) return <main className="mx-auto max-w-6xl px-5 py-12" role="alert">{errorMessage(me.error)} <Button variant="outline" onClick={() => void me.refetch()}>다시 확인</Button></main>;
  if (!owner) return <main className="mx-auto max-w-6xl px-5 py-12"><h1 className="text-3xl font-semibold">홈 디자인</h1><p className="mt-4" role="alert">홈 디자인 변경은 사이트 owner만 할 수 있습니다.</p></main>;
  if (settings.isError) return <main className="mx-auto max-w-6xl space-y-3 px-5 py-12" role="alert"><p>{errorMessage(settings.error)}</p><Button variant="outline" onClick={() => void settings.refetch()}>다시 불러오기</Button></main>;
  if (settings.isPending || !draftSettings) return <main className="mx-auto max-w-6xl px-5 py-12" role="status">홈 설정을 불러오고 있어요…</main>;

  const selected = templates.find((template) => template.id === draftSettings.template_id)?.id ?? "D";
  const publishedTemplate = templates.find((template) => template.id === current?.template_id)?.id ?? "D";
  const previewTitle = typeof draftSettings.title === "string" ? draftSettings.title : "천천히 머물고, 오래 기억하는 여행";
  const previewDescription = typeof draftSettings.description === "string" ? draftSettings.description : "여행에서 만난 장면을 한 장씩 기록합니다.";
  const latestPosts = publishedPosts.data ?? [];

  return <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-10 md:px-8 md:py-14">
    <header><p className="text-muted-foreground text-sm tracking-widest">SITE APPEARANCE</p><h1 className="mt-2 text-3xl font-semibold">홈 디자인</h1><p className="text-muted-foreground mt-3 max-w-2xl">선택과 미리보기는 초안에서만 바뀝니다. 공개 사이트에 보이게 하려면 적용을 눌러야 합니다.</p></header>
    {feedback && <p role="status" aria-live="polite">{feedback}</p>}
    <section aria-labelledby="templates-heading"><h2 id="templates-heading" className="text-xl font-semibold">표지 고르기</h2><ul className="mt-4 grid gap-4 md:grid-cols-2">{templates.map((template) => <li key={template.id}><button type="button" aria-pressed={selected === template.id} onClick={() => update("template_id", template.id)} className={`w-full rounded-panel border p-5 text-left transition-colors hover:border-primary ${selected === template.id ? "border-primary ring-2 ring-primary/20" : "border-border"}`}><span className="flex items-center justify-between gap-4"><span className="text-xl font-semibold">{template.id} · {template.name}</span>{publishedTemplate === template.id && <span className="rounded-control bg-muted px-3 py-2 text-sm">공개 중</span>}</span><span className="text-muted-foreground mt-2 block">{template.description}</span><span className={`mt-5 grid min-h-36 overflow-hidden rounded border p-4 ${template.id === "B" ? "bg-[#173c42] text-white" : template.id === "C" ? "bg-[#e8ece3]" : "bg-[#f6f5ef]"} ${template.id === "A" ? "grid-cols-[0.7fr_1fr]" : template.id === "C" ? "items-end" : "grid-cols-2 items-center"}`}><span className="rounded bg-[#b9d1cf] p-4" aria-hidden="true"/><span className="space-y-2 p-3"><span className="block h-2 w-1/3 rounded bg-current opacity-40"/><span className="block h-3 w-5/6 rounded bg-current opacity-70"/><span className="block h-2 w-2/3 rounded bg-current opacity-40"/></span></span></button></li>)}</ul></section>
    <section aria-labelledby="preview-heading" className="space-y-4"><div><h2 id="preview-heading" className="text-xl font-semibold">초안 미리보기</h2><p className="text-muted-foreground mt-1">공개 설정은 아직 변경되지 않았습니다.</p></div><article className={`relative grid min-h-72 overflow-hidden rounded-panel border p-5 sm:min-h-96 sm:p-8 ${selected === "B" ? "border-[#173c42] bg-[#173c42] text-white" : selected === "C" ? "grid-rows-[auto_1fr] bg-[#e8ece3]" : "bg-[#f6f5ef]"} ${selected === "A" ? "grid-cols-2 items-center" : "grid-cols-[1fr_0.8fr] items-end"}`}><div className={`rounded bg-[#b9d1cf] ${selected === "A" ? "min-h-56" : "absolute inset-4 sm:inset-8"}`} aria-label="홈 사진 미리보기" role="img">{typeof draftSettings.hero_asset_id === "string" && draftSettings.hero_asset_id && <div className="h-full overflow-hidden rounded"><PrivateAssetView assetId={draftSettings.hero_asset_id} siteId={siteId} kind="image" title="홈 표지 초안" /></div>}</div><div className="relative z-10 rounded-panel border bg-background p-5 shadow sm:p-8"><p className="text-muted-foreground text-xs tracking-widest">{selected} · HOME PREVIEW</p><h3 className="mt-3 font-serif text-2xl">{previewTitle}</h3><p className="text-muted-foreground mt-3">{previewDescription}</p></div></article></section>
    <div className="grid gap-5 md:grid-cols-2"><label className="block space-y-2">홈 제목<Input value={typeof draftSettings.title === "string" ? draftSettings.title : ""} maxLength={150} onChange={(event) => update("title", event.currentTarget.value)} /></label><label className="block space-y-2">홈 소개<Input value={typeof draftSettings.description === "string" ? draftSettings.description : ""} maxLength={500} onChange={(event) => update("description", event.currentTarget.value)} /></label></div>
    <label className="block max-w-2xl space-y-2">대표 여행 글<Select value={typeof draftSettings.featured_post_id === "string" ? draftSettings.featured_post_id : ""} onChange={(event) => update("featured_post_id", event.currentTarget.value || null)}><option value="">최근 공개 글 사용</option>{latestPosts.map((post) => <option value={post.id} key={post.id}>{post.title || "제목 없는 글"}</option>)}</Select></label>
    <section className="space-y-3"><h2 className="text-xl font-semibold">홈 대표 사진</h2>{typeof draftSettings.hero_asset_id === "string" && draftSettings.hero_asset_id && <PrivateAssetView assetId={draftSettings.hero_asset_id} siteId={siteId} kind="image" title="홈 대표 사진" />}<MediaUpload siteId={siteId} kindFilter="image" onSetCoverImage={(assetId) => update("hero_asset_id", assetId)} /></section>
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy || !dirty} onClick={() => { setBusy(true); void save().then(() => setFeedback("홈 디자인 초안을 저장했습니다.")).catch((error: unknown) => setFeedback(error instanceof TravelApiError ? errorMessage(error) : "초안을 저장하지 못했습니다.")).finally(() => setBusy(false)); }}>{busy ? "저장 중…" : "초안 저장"}</Button><Button disabled={busy} onClick={() => setApplyDialog(true)}>공개 홈에 적용</Button></div>
    <Dialog open={applyDialog} onOpenChange={setApplyDialog} title="공개 홈에 적용할까요?" description="현재 미리보기의 제목, 대표 사진, 추천 글과 표지 구성이 방문자에게 공개됩니다."><div className="flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setApplyDialog(false)}>취소</Button><Button disabled={busy} onClick={() => void apply()}>{busy ? "적용 중…" : "공개 홈에 적용"}</Button></div></Dialog>
  </main>;
}
