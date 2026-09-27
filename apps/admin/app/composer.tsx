"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
function blockHasContent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(blockHasContent);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => key === "props"
    ? blockHasContent(child)
    : key !== "id" && key !== "type" && blockHasContent(child));
}
function blockText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(blockText).join("");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  return typeof record.content === "string" || Array.isArray(record.content) ? blockText(record.content) : "";
}
export function Composer({ postId }: { postId?: string }) {
  const router = useRouter();
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [siteId, setSiteId] = useState("");
  const me = useTravelQuery(api, "me", {}, { siteId, actor: "session" }, { enabled: !!siteId });
  const mutationScope = { siteId, actor: me.data?.user_id ?? "session" };
  const createPost = useTravelMutation(api, "admin.post.create", mutationScope);
  const savePost = useTravelMutation(api, "admin.post.save", mutationScope);
  const submitSave = savePost.submit;
  const publishPost = useTravelMutation(api, "admin.post.publish", mutationScope);
  const changePostStatus = useTravelMutation(api, "admin.post.status", mutationScope);
  const restoreRevision = useTravelMutation(api, "admin.revision.restore", mutationScope);
  const [insertImage, setInsertImage] = useState<(assetId: string, caption?: string) => void>();
  const [coverAssetId, setCoverAssetId] = useState("");
  const [pdfAssetId, setPdfAssetId] = useState("");
  const [post, setPost] = useState<PostDraft>();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["code"]>("day-walk");
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [metadataError, setMetadataError] = useState("");
  const [document, setDocument] = useState<EditorDocument>([
    { type: "paragraph", content: "여행의 첫 장면을 적어 보세요." },
  ]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [autoSaveBlocked, setAutoSaveBlocked] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [latestDraft, setLatestDraft] = useState<PostDraft>();
  const savingRef = useRef(false);
  const editVersionRef = useRef(0);
  const revisions = useTravelQuery(api, "admin.revisions", { id: postId ?? "00000000-0000-4000-8000-000000000000", limit: 20, offset: 0 }, mutationScope, { enabled: !!postId });

  function applyDraft(draft: PostDraft) {
    const content = draft.draft_content;
    setPost(draft);
    setLastSavedAt(draft.updated_at);
    setTitle(typeof content.title === "string" ? content.title : "");
    setSlug(typeof content.slug === "string" ? content.slug : "");
    setTags(Array.isArray(content.tags) ? content.tags.filter((tag): tag is string => typeof tag === "string") : []);
    setTagsText(Array.isArray(content.tags) ? content.tags.filter((tag): tag is string => typeof tag === "string").join(", ") : "");
    setSlugEdited(typeof content.slug === "string" && content.slug.length > 0);
    const found = CATEGORIES.find((item) => item.code === content.category_code);
    if (found) setCategory(found.code);
    setMetadata(content.metadata && typeof content.metadata === "object" && !Array.isArray(content.metadata) ? content.metadata as Record<string, unknown> : {});
    if (Array.isArray(content.blocks)) setDocument(content.blocks as EditorDocument);
    setCoverAssetId(typeof content.cover_asset_id === "string" ? content.cover_asset_id : "");
    setPdfAssetId(typeof content.pdf_asset_id === "string" ? content.pdf_asset_id : "");
  }

  function markDirty() {
    editVersionRef.current += 1;
    setDirty(true);
    setSaveError("");
    setAutoSaveBlocked(false);
  }

  function updateMetadata(key: string, value: string) {
    setMetadata((current) => ({ ...current, [key]: value }));
    setMetadataError("");
    markDirty();
  }

  useEffect(() => {
    let active = true;
    void api.getSite().then((site) => active && setSiteId(site.id)).catch(() => active && setMessage("사이트 정보를 불러오지 못했습니다."));
    if (postId) {
      void api.call("admin.post.get", { id: postId }).then((draft) => {
        if (!active) return;
        applyDraft(draft);
      }).catch((error: unknown) => setMessage(error instanceof TravelApiError ? errorMessage(error) : "글을 불러오지 못했습니다."));
    }
    return () => { active = false; };
  }, [api, postId]);

  const onEditorReady = useCallback(
    (insert: (assetId: string, caption?: string) => void) => setInsertImage(() => insert),
    [],
  );

  const saveDraft = useCallback(async () => {
    if (!post || savingRef.current) return false;
    if (post.kind === "article") {
      const validationError = validateDraftMetadata(category as Exclude<(typeof CATEGORIES)[number]["code"], "itinerary-pdf">, metadata);
      if (validationError) {
        setMetadataError(validationError);
        setSaveError(validationError === "invalid_date" ? "날짜를 다시 확인해 주세요." : validationError === "invalid_dates" ? "종료일은 시작일 이후로 선택해 주세요." : "카페 또는 음식점 중 하나를 선택해 주세요.");
        setAutoSaveBlocked(true);
        return false;
      }
    }
    savingRef.current = true;
    const editVersionAtStart = editVersionRef.current;
    setSaving(true);
    setSaveError("");
    setMetadataError("");
    try {
      const content = JSON.parse(JSON.stringify({
        ...post.draft_content,
        title: title.trim(),
        slug: slug.trim(),
        tags,
        category_code: post.kind === "pdf" ? "itinerary-pdf" : category,
        ...(post.kind === "article" ? { metadata } : {}),
        ...(post.kind === "article"
          ? { blocks: document, cover_asset_id: coverAssetId || null }
          : { pdf_asset_id: pdfAssetId || null }),
      })) as ActionInput<"admin.post.save">["content"];
      const saved = await submitSave({
        id: post.id,
        version: post.lock_version,
        content,
      });
      setPost(saved);
      if (post.kind === "article" && saved.draft_content.metadata && typeof saved.draft_content.metadata === "object" && !Array.isArray(saved.draft_content.metadata)) {
        setMetadata(saved.draft_content.metadata as Record<string, unknown>);
      }
      setLastSavedAt(saved.updated_at);
      // Keep changes made during this request dirty for the next idle save.
      setDirty(editVersionRef.current !== editVersionAtStart);
      setAutoSaveBlocked(false);
      setSaveError("");
      return true;
    } catch (error) {
      setSaveError(error instanceof TravelApiError ? errorMessage(error) : "저장하지 못했습니다. 입력 내용은 화면에 남아 있습니다.");
      setAutoSaveBlocked(true);
      if (error instanceof TravelApiError && error.status === 409) {
        setSaveError("다른 탭이나 기기에서 글이 변경됐습니다. 내 입력은 유지되어 있습니다.");
        void api.call("admin.post.get", { id: post.id }).then(setLatestDraft).catch(() => setSaveError("최신본을 불러오지 못했습니다. 내 입력은 그대로 보존했습니다."));
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [api, category, coverAssetId, document, metadata, pdfAssetId, post, slug, submitSave, tags, title]);

  const publishChecks = post ? post.kind === "article" ? [
    { label: "제목과 주소 이름", valid: title.trim().length > 0 && slug.trim().length > 0 },
    { label: "분류별 여행 정보", valid: !validateDraftMetadata(category as Exclude<(typeof CATEGORIES)[number]["code"], "itinerary-pdf">, metadata) },
    { label: "본문 내용", valid: document.some(blockHasContent) },
    { label: "대표 사진", valid: !!coverAssetId },
  ] : [
    { label: "제목과 주소 이름", valid: title.trim().length > 0 && slug.trim().length > 0 },
    { label: "일정 PDF 파일", valid: !!pdfAssetId },
  ] : [];

  async function restoreSnapshot(revisionId: string) {
    if (!post || !window.confirm("이 수정 이력을 현재 초안으로 복원할까요? 현재 초안은 이력으로 남습니다.")) return;
    setBusy(true);
    try {
      applyDraft(await restoreRevision.submit({ id: post.id, version: post.lock_version, revision_id: revisionId }));
      setDirty(false);
      setLatestDraft(undefined);
      setMessage("선택한 수정 이력을 복원했습니다.");
    } catch (error) {
      setSaveError(error instanceof TravelApiError && error.status === 409 ? "복원 중 글이 변경됐습니다. 최신본을 다시 불러와 주세요." : error instanceof TravelApiError ? errorMessage(error) : "수정 이력을 복원하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!post) return;
    const missing = publishChecks.filter((check) => !check.valid).map((check) => check.label);
    if (post.kind === "article" && missing.length) {
      setMessage(`발행 전에 확인해 주세요: ${missing.join(", ")}`);
      setPreview(true);
      return;
    }
    if (!window.confirm(`“${title || "제목 없는 글"}”을(를) 공개 발행할까요?`)) return;
    setBusy(true);
    setMessage("");
    try {
      if (dirty) {
        if (!await saveDraft()) throw new Error("초안을 저장하지 못해 발행을 중단했습니다. 입력은 그대로 보존했습니다.");
        setBusy(true);
      }
      const latest = await api.call("admin.post.get", { id: post.id });
      await publishPost.submit({ id: latest.id, site_id: latest.site_id, version: latest.lock_version });
      applyDraft({ ...latest, status: "published", lock_version: latest.lock_version + 1 });
      setDirty(false);
      setMessage("글을 공개 발행했습니다.");
    } catch (error) {
      setMessage(error instanceof TravelApiError ? errorMessage(error) : error instanceof Error ? error.message : "발행하지 못했습니다.");
      if (error instanceof TravelApiError && error.status === 409) void api.call("admin.post.get", { id: post.id }).then(setLatestDraft).catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function changeStatus(next: "private" | "trashed") {
    if (!post) return;
    const label = next === "private" ? "비공개로 전환" : "휴지통으로 이동";
    if (!window.confirm(`“${title || "제목 없는 글"}”을(를) ${label}할까요?${next === "trashed" ? " 게시 중인 글은 공개 목록에서 즉시 숨겨집니다." : ""}`)) return;
    setBusy(true);
    setMessage("");
    try {
      if (dirty) {
        if (!await saveDraft()) throw new Error("먼저 초안을 저장해야 합니다. 입력은 그대로 보존했습니다.");
        setBusy(true);
      }
      const latest = await api.call("admin.post.get", { id: post.id });
      const result = await changePostStatus.submit({ id: latest.id, site_id: latest.site_id, version: latest.lock_version, status: next });
      applyDraft({ ...latest, status: result.status, lock_version: result.version });
      setDirty(false);
      setMessage(next === "private" ? "글을 비공개로 전환했습니다." : "글을 휴지통으로 옮겼습니다.");
    } catch (error) {
      setMessage(error instanceof TravelApiError ? errorMessage(error) : error instanceof Error ? error.message : "상태를 변경하지 못했습니다. 다시 불러와 주세요.");
      if (error instanceof TravelApiError && error.status === 409) void api.call("admin.post.get", { id: post.id }).then(setLatestDraft).catch(() => undefined);
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!dirty || busy || saving || autoSaveBlocked || !post) return;
    const timer = setTimeout(() => void saveDraft(), 1800);
    return () => clearTimeout(timer);
  }, [autoSaveBlocked, busy, dirty, post, saveDraft, saving]);

  useEffect(() => {
    if (!dirty || !post) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      if (!window.confirm("저장되지 않은 변경이 있어요. 지금 저장한 뒤 이동할까요?")) return;
      void saveDraft().then((saved) => {
        if (saved) router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.document.addEventListener("click", handleInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.document.removeEventListener("click", handleInternalNavigation, true);
    };
  }, [dirty, post, router, saveDraft]);

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
        <div><p className="text-muted-foreground">초안 편집</p><h1 className="font-editorial mt-2 text-3xl font-semibold">{post.kind === "pdf" ? "PDF 일정표" : "여행 기록"}</h1></div>
        <div className="flex flex-wrap gap-2">{post.kind === "article" && <Button variant="outline" onClick={() => setPreview(!preview)}>{preview ? "이어서 쓰기" : "미리보기"}</Button>}<Button variant="outline" disabled={busy} onClick={() => void changeStatus("trashed")}>휴지통</Button>{post.status === "published" && <Button variant="outline" disabled={busy} onClick={() => void changeStatus("private")}>비공개</Button>}{post.status !== "published" && post.status !== "trashed" && <Button disabled={busy} onClick={() => void publish()}>발행</Button>}<Button variant="outline" disabled={busy || saving || !dirty} onClick={() => void saveDraft()}>{saving || busy ? "저장 중…" : "초안 저장"}</Button></div>
      </header>
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{busy || saving ? "저장 중…" : saveError ? `저장 실패: ${saveError}` : dirty ? "저장되지 않은 변경 사항 · 자동 저장 대기 중" : lastSavedAt ? `마지막 저장: ${new Date(lastSavedAt).toLocaleString("ko-KR")}` : "저장된 변경 사항 없음"}</p>
      {latestDraft && <aside className="space-y-3 rounded-panel border border-amber-500 p-4" aria-label="버전 충돌 해결">
        <h2 className="font-semibold">최신 저장본과 충돌</h2>
        <p>최신본 v{latestDraft.lock_version} · {new Date(latestDraft.updated_at).toLocaleString("ko-KR")} · 제목: {typeof latestDraft.draft_content.title === "string" ? latestDraft.draft_content.title || "(제목 없음)" : "(제목 없음)"}</p>
        <p>현재 입력은 별도로 유지됩니다. 최신본으로 교체하거나, 최신 버전을 기준으로 현재 입력을 다시 저장할 수 있습니다.</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { applyDraft(latestDraft); setDirty(false); setLatestDraft(undefined); setSaveError(""); }}>최신본으로 교체</Button><Button disabled={busy} onClick={() => { setPost(latestDraft); setLatestDraft(undefined); markDirty(); }}>최신 버전에 내 입력 저장</Button></div>
      </aside>}
      <label className="block space-y-2">글 제목<Input disabled={busy} value={title} maxLength={150} onChange={(event) => { const value = event.currentTarget.value; setTitle(value); if (!slugEdited) { const suggestedSlug = value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120); setSlug(suggestedSlug || `travel-note-${postId.slice(0, 8)}`); } markDirty(); }} /></label>
      <label className="block space-y-2">주소 이름<Input disabled={busy} value={slug} maxLength={120} onChange={(event) => { setSlugEdited(true); setSlug(event.currentTarget.value); markDirty(); }} /></label>
      {post.kind === "article" && <label className="block space-y-2">태그<Input disabled={busy} value={tagsText} maxLength={300} placeholder="쉼표로 구분해 입력 (예: 제주, 가족여행)" onChange={(event) => { const value = event.currentTarget.value; setTagsText(value); setTags([...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 10)); markDirty(); }} /></label>}
      {post.kind === "article" && <label className="block space-y-2">분류<Select disabled={busy} value={category} onChange={(event) => { setCategory(event.currentTarget.value as typeof category); setMetadataError(""); markDirty(); }}>{CATEGORIES.filter((item) => item.code !== "itinerary-pdf").map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</Select></label>}
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
      {post.kind === "article" && <section className="space-y-3 rounded-panel border p-4" aria-label="수정 이력"><h2 className="font-semibold">수정 이력</h2>{revisions.data?.length ? <ul className="space-y-2">{revisions.data.map((revision) => <li className="flex flex-wrap items-center justify-between gap-2" key={revision.id}><span>{new Date(revision.created_at).toLocaleString("ko-KR")}</span><Button variant="outline" disabled={busy} onClick={() => void restoreSnapshot(revision.id)}>이 이력 복원</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">저장된 체크포인트 이력이 없습니다. 발행본은 수정 이력으로 보존됩니다.</p>}</section>}
      {post.kind === "article" && <section className="space-y-3 rounded-panel border p-4" aria-label={preview ? "공개 미리보기" : "본문 편집기"}>
        {preview ? <article className="mx-auto max-w-2xl space-y-5 py-6"><p className="text-sm text-muted-foreground">{CATEGORIES.find((item) => item.code === category)?.label} · {typeof metadata.region === "string" ? metadata.region : "지역 미입력"}</p><h2 className="font-editorial text-3xl font-semibold">{title || "제목을 입력해 주세요"}</h2>{coverAssetId && siteId && <PrivateAssetView assetId={coverAssetId} siteId={siteId} kind="image" title="대표 사진 미리보기" />}<div className="flex flex-wrap gap-2">{tags.map((tag) => <span className="rounded-full bg-stone-100 px-3 py-1 text-sm" key={tag}>#{tag}</span>)}</div><div className="space-y-4">{document.map((block, index) => { const previewBlock = block as { type?: string; props?: Record<string, unknown> }; return previewBlock.type === "image" && typeof previewBlock.props?.asset_id === "string" && siteId ? <PrivateAssetView key={block.id ?? index} assetId={previewBlock.props.asset_id} siteId={siteId} kind="image" title={typeof previewBlock.props.caption === "string" ? previewBlock.props.caption : "본문 사진"} /> : previewBlock.type === "heading" ? <h3 className="font-editorial text-2xl font-semibold" key={block.id ?? index}>{blockText(block)}</h3> : <p className="whitespace-pre-wrap" key={block.id ?? index}>{blockText(block)}</p>; })}</div></article> : <Editor key={`${post.id}-edit`} initialContent={document} editable={!busy} onChange={(nextDocument) => { if (JSON.stringify(nextDocument) === JSON.stringify(document)) return; setDocument(nextDocument); markDirty(); }} onReady={onEditorReady} />}
      </section>}
      {post.kind === "article" && preview && <section className="space-y-2 rounded-panel border p-4" aria-label="발행 전 확인"><h2 className="font-semibold">발행 전 확인</h2><ul>{publishChecks.map((check) => <li key={check.label}>{check.valid ? "✓" : "○"} {check.label}</li>)}</ul><p>{publishChecks.every((check) => check.valid) ? "필수 항목이 준비되었습니다. 발행은 별도 확인 후 진행합니다." : "비어 있는 항목을 채우면 발행할 수 있습니다."}</p></section>}
      {siteId && (post.kind === "pdf" ? <MediaUpload key="pdf-upload" siteId={siteId} kindFilter="pdf" onSelectPdf={(assetId) => { setPdfAssetId(assetId); markDirty(); }} /> : <MediaUpload key="image-upload" siteId={siteId} kindFilter="image" onInsertImage={(assetId, caption) => { insertImage?.(assetId, caption); markDirty(); }} onSetCoverImage={(assetId) => { setCoverAssetId(assetId); markDirty(); }} />)}
      {siteId && coverAssetId && <section className="space-y-2 rounded-lg border p-4" aria-label="대표 사진 미리보기"><h2 className="font-medium">선택한 대표 사진</h2><PrivateAssetView assetId={coverAssetId} siteId={siteId} kind="image" title="대표 사진" /></section>}
      {siteId && pdfAssetId && <section className="space-y-2 rounded-lg border p-4" aria-label="선택한 일정 PDF"><h2 className="font-medium">선택한 일정 PDF</h2><PrivateAssetView assetId={pdfAssetId} siteId={siteId} kind="pdf" title="일정 PDF" /></section>}
    </main>
  );
}
