"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EditorDocument } from "@repo/editor";
import { CATEGORIES } from "@repo/constants";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Select } from "@repo/ui/select";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { TravelApiError, errorMessage } from "@repo/api-client";
import type { ActionInput, ActionOutput } from "@repo/contracts";
import { validateDraftMetadata } from "@repo/contracts";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { MediaUpload } from "./media-upload";
import { PrivateAssetView } from "./asset-view";
const Editor = dynamic(
  () => import("@repo/editor").then((module) => module.WriterEditor),
  { ssr: false, loading: () => <p>편집기를 준비하고 있어요…</p> },
);
type PostDraft = ActionOutput<"admin.post.get">;
export function Composer({ postId }: { postId?: string }) {
  const router = useRouter();
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [siteId, setSiteId] = useState("");
  const me = useTravelQuery(api, "me", {}, { siteId, actor: "session" }, { enabled: !!siteId });
  const mutationScope = { siteId, actor: me.data?.user_id ?? "session" };
  const createPost = useTravelMutation(api, "admin.post.create", mutationScope);
  const savePost = useTravelMutation(api, "admin.post.save", mutationScope);
  const [insertImage, setInsertImage] = useState<(assetId: string, caption?: string) => void>();
  const [coverAssetId, setCoverAssetId] = useState("");
  const [pdfAssetId, setPdfAssetId] = useState("");
  const [post, setPost] = useState<PostDraft>();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["code"]>("day-walk");
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [metadataError, setMetadataError] = useState("");
  const [document, setDocument] = useState<EditorDocument>([
    { type: "paragraph", content: "여행의 첫 장면을 적어 보세요." },
  ]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function updateMetadata(key: string, value: string) {
    setMetadata((current) => ({ ...current, [key]: value }));
    setMetadataError("");
  }

  useEffect(() => {
    let active = true;
    void api.getSite().then((site) => active && setSiteId(site.id)).catch(() => active && setMessage("사이트 정보를 불러오지 못했습니다."));
    if (postId) {
      void api.call("admin.post.get", { id: postId }).then((draft) => {
        if (!active) return;
        const content = draft.draft_content;
        setPost(draft);
        setTitle(typeof content.title === "string" ? content.title : "");
        setSlug(typeof content.slug === "string" ? content.slug : "");
        setSlugEdited(typeof content.slug === "string" && content.slug.length > 0);
        const found = CATEGORIES.find((item) => item.code === content.category_code);
        if (found) setCategory(found.code);
        if (content.metadata && typeof content.metadata === "object" && !Array.isArray(content.metadata)) {
          setMetadata(content.metadata as Record<string, unknown>);
        }
        if (Array.isArray(content.blocks)) setDocument(content.blocks as EditorDocument);
        setCoverAssetId(typeof content.cover_asset_id === "string" ? content.cover_asset_id : "");
        setPdfAssetId(typeof content.pdf_asset_id === "string" ? content.pdf_asset_id : "");
      }).catch((error: unknown) => setMessage(error instanceof TravelApiError ? errorMessage(error) : "글을 불러오지 못했습니다."));
    }
    return () => { active = false; };
  }, [api, postId]);

  const onEditorReady = useCallback(
    (insert: (assetId: string, caption?: string) => void) => setInsertImage(() => insert),
    [],
  );

  async function create(kind: "article" | "pdf") {
    setBusy(true);
    setMessage("");
    try {
      if (!siteId) throw new Error("사이트 정보를 불러오는 중입니다.");
      const created = await createPost.submit({
        site_id: siteId,
        kind,
        content: kind === "pdf" ? { category_code: "itinerary-pdf" } : { category_code: "day-walk", blocks: [] },
      });
      router.replace(`/write/${created.id}`);
    } catch (error) {
      setMessage(error instanceof TravelApiError ? errorMessage(error) : error instanceof Error ? error.message : "새 글을 만들지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function save() {
    if (!post) return;
    if (post.kind === "article") {
      const validationError = validateDraftMetadata(category as Exclude<(typeof CATEGORIES)[number]["code"], "itinerary-pdf">, metadata);
      if (validationError) {
        setMetadataError(validationError);
        return;
      }
    }
    setBusy(true);
    setMessage("");
    setMetadataError("");
    try {
      const content = JSON.parse(JSON.stringify({
        ...post.draft_content,
        title: title.trim(),
        slug: slug.trim(),
        category_code: post.kind === "pdf" ? "itinerary-pdf" : category,
        ...(post.kind === "article" ? { metadata } : {}),
        ...(post.kind === "article"
          ? { blocks: document, cover_asset_id: coverAssetId || null }
          : { pdf_asset_id: pdfAssetId || null }),
      })) as ActionInput<"admin.post.save">["content"];
      const saved = await savePost.submit({
        id: post.id,
        version: post.lock_version,
        content,
      });
      setPost(saved);
      if (post.kind === "article" && saved.draft_content.metadata && typeof saved.draft_content.metadata === "object" && !Array.isArray(saved.draft_content.metadata)) {
        setMetadata(saved.draft_content.metadata as Record<string, unknown>);
      }
      setMessage("초안을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof TravelApiError ? errorMessage(error) : "저장하지 못했습니다. 입력 내용은 화면에 남아 있습니다.");
    } finally { setBusy(false); }
  }

  if (!postId) return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-12 md:px-8">
      <p className="text-muted-foreground">오늘도 함께 걷다 · 글 관리</p>
      <h1 className="font-editorial text-3xl font-semibold">새 기록 시작하기</h1>
      <p>여행 글 또는 PDF 일정표를 선택해 주세요.</p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !siteId} onClick={() => void create("article")}>여행 글 쓰기</Button>
        <Button variant="outline" disabled={busy || !siteId} onClick={() => void create("pdf")}>PDF 일정표 만들기</Button>
      </div>
      {message && <p role="status">{message}</p>}
    </main>
  );

  if (!post) return <main className="mx-auto max-w-4xl px-5 py-12" role={message ? "alert" : "status"}>{message || "글을 불러오고 있어요…"}</main>;
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-12 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-muted-foreground">초안 편집</p><h1 className="font-editorial mt-2 text-3xl font-semibold">여행 기록</h1></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setPreview(!preview)}>{preview ? "이어서 쓰기" : "미리보기"}</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "저장 중…" : "초안 저장"}</Button></div>
      </header>
      <label className="block space-y-2">글 제목<Input disabled={busy} value={title} maxLength={150} onChange={(event) => { const value = event.currentTarget.value; setTitle(value); if (!slugEdited) { const suggestedSlug = value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120); setSlug(suggestedSlug || `travel-note-${postId.slice(0, 8)}`); } }} /></label>
      <label className="block space-y-2">주소 이름<Input disabled={busy} value={slug} maxLength={120} onChange={(event) => { setSlugEdited(true); setSlug(event.currentTarget.value); }} /></label>
      {post.kind === "article" && <label className="block space-y-2">분류<Select disabled={busy} value={category} onChange={(event) => { setCategory(event.currentTarget.value as typeof category); setMetadataError(""); }}>{CATEGORIES.filter((item) => item.code !== "itinerary-pdf").map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</Select></label>}
      {post.kind === "article" && <fieldset className="space-y-4 rounded-panel border p-5">
        <legend className="px-2 font-semibold">여행 정보</legend>
        <p className="text-muted-foreground text-sm">초안은 비워 두어도 저장됩니다. 별표 항목은 공개 발행 전에 필요합니다.</p>
        <label className="block space-y-2">지역명 *<Input disabled={busy} value={typeof metadata.region === "string" ? metadata.region : ""} maxLength={100} onChange={(event) => updateMetadata("region", event.currentTarget.value)} placeholder="예: 제주 서귀포" /></label>
        {(category === "day-walk" || category === "food-cafe") && <label className="block space-y-2">방문일 *<Input disabled={busy} type="date" value={typeof metadata.visited_on === "string" ? metadata.visited_on : ""} onChange={(event) => updateMetadata("visited_on", event.currentTarget.value)} /></label>}
        {category === "overnight-trip" && <div className="grid gap-4 md:grid-cols-2"><label className="block space-y-2">여행 시작일 *<Input disabled={busy} type="date" value={typeof metadata.start_date === "string" ? metadata.start_date : ""} onChange={(event) => updateMetadata("start_date", event.currentTarget.value)} /></label><label className="block space-y-2">여행 종료일 *<Input disabled={busy} type="date" min={typeof metadata.start_date === "string" ? metadata.start_date : undefined} value={typeof metadata.end_date === "string" ? metadata.end_date : ""} onChange={(event) => updateMetadata("end_date", event.currentTarget.value)} /></label></div>}
        {category === "stay-review" && <div className="grid gap-4 md:grid-cols-2"><label className="block space-y-2">체크인 *<Input disabled={busy} type="date" value={typeof metadata.check_in === "string" ? metadata.check_in : ""} onChange={(event) => updateMetadata("check_in", event.currentTarget.value)} /></label><label className="block space-y-2">체크아웃 *<Input disabled={busy} type="date" min={typeof metadata.check_in === "string" ? metadata.check_in : undefined} value={typeof metadata.check_out === "string" ? metadata.check_out : ""} onChange={(event) => updateMetadata("check_out", event.currentTarget.value)} /></label></div>}
        {(category === "food-cafe" || category === "stay-review") && <label className="block space-y-2">{category === "food-cafe" ? "장소명 *" : "숙소명 *"}<Input disabled={busy} value={typeof metadata.place_name === "string" ? metadata.place_name : ""} maxLength={150} onChange={(event) => updateMetadata("place_name", event.currentTarget.value)} placeholder={category === "food-cafe" ? "예: 바다 앞 작은 카페" : "예: 서귀포 바다 숙소"} /></label>}
        {category === "food-cafe" && <label className="block space-y-2">장소 종류 *<Select disabled={busy} value={typeof metadata.venue_type === "string" ? metadata.venue_type : ""} onChange={(event) => updateMetadata("venue_type", event.currentTarget.value)}><option value="">종류를 선택해 주세요</option><option value="cafe">카페</option><option value="restaurant">음식점</option></Select></label>}
        {metadataError && <p role="alert">{metadataError === "invalid_date" ? "날짜를 다시 확인해 주세요." : metadataError === "invalid_dates" ? "종료일은 시작일 이후로 선택해 주세요." : "카페 또는 음식점 중 하나를 선택해 주세요."}</p>}
      </fieldset>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      <section aria-label={preview ? "본문 미리보기" : "본문 편집기"} className="min-h-96 rounded-lg border bg-white py-8">
        <Editor key={`${post.id}-${preview ? "preview" : "edit"}`} initialContent={document} editable={!preview && !busy} onChange={setDocument} onReady={onEditorReady} />
      </section>
      {siteId && <MediaUpload siteId={siteId} onInsertImage={insertImage} onSetCoverImage={setCoverAssetId} onSelectPdf={setPdfAssetId} />}
      {siteId && coverAssetId && <section className="space-y-2 rounded-lg border p-4" aria-label="대표 사진 미리보기"><h2 className="font-medium">선택한 대표 사진</h2><PrivateAssetView assetId={coverAssetId} siteId={siteId} kind="image" title="대표 사진" /></section>}
      {siteId && pdfAssetId && <section className="space-y-2 rounded-lg border p-4" aria-label="선택한 일정 PDF"><h2 className="font-medium">선택한 일정 PDF</h2><PrivateAssetView assetId={pdfAssetId} siteId={siteId} kind="pdf" title="일정 PDF" /></section>}
    </main>
  );
}
