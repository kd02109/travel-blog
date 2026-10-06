"use client";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { EditorDocument } from "@repo/editor";
import { CATEGORIES } from "@repo/constants";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { TravelApiError } from "@repo/api-client";
import { ApiErrorState, ApiMutationError } from "@repo/api-client/feedback";
import type { ActionInput, ActionOutput } from "@repo/contracts";
import { validateDraftMetadata } from "@repo/contracts";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { MediaUpload, uploadEditorImage } from "./media-upload";
import { PrivateAssetView } from "./asset-view";
import { hasUnpublishedChanges } from "../lib/post-publication";
const Editor = dynamic(
  () => import("@repo/editor").then((module) => module.WriterEditor),
  { ssr: false, loading: () => <p>편집기를 준비하고 있어요…</p> },
);
type PostDraft = ActionOutput<"admin.post.get">;
const EMPTY_ID = "00000000-0000-4000-8000-000000000000";
function snapshotText(snapshot: Record<string, unknown>, key: string): string {
  return typeof snapshot[key] === "string" ? snapshot[key] : "";
}
function SnapshotView({
  snapshot,
  kind,
  siteId,
  revisionId,
  renderImage,
}: {
  snapshot: Record<string, unknown>;
  kind: "article" | "pdf";
  siteId: string;
  revisionId: string;
  renderImage: (assetId: string) => ReactNode;
}) {
  const title = snapshotText(snapshot, "title") || "제목 없음";
  const category = CATEGORIES.find(
    (item) => item.code === snapshot.category_code,
  );
  const metadata =
    snapshot.metadata &&
    typeof snapshot.metadata === "object" &&
    !Array.isArray(snapshot.metadata)
      ? (snapshot.metadata as Record<string, unknown>)
      : {};
  const tags = Array.isArray(snapshot.tags)
    ? snapshot.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const coverId = snapshotText(snapshot, "cover_asset_id");
  const pdfId = snapshotText(snapshot, "pdf_asset_id");
  return (
    <article className="space-y-5 rounded-lg border bg-white p-5 md:p-7">
      <div className="space-y-2 border-b pb-4">
        <p className="text-muted-foreground text-sm">
          {category?.label ?? "분류 없음"}
          {typeof metadata.region === "string" ? ` · ${metadata.region}` : ""}
        </p>
        <h3 className="font-editorial text-2xl font-semibold">{title}</h3>
        {snapshotText(snapshot, "slug") && (
          <p className="text-muted-foreground text-xs">
            주소: /posts/{snapshotText(snapshot, "slug")}
          </p>
        )}
      </div>
      {coverId && siteId && (
        <PrivateAssetView
          assetId={coverId}
          siteId={siteId}
          kind="image"
          title={`${title} 대표 사진`}
        />
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              className="rounded-full bg-stone-100 px-3 py-1 text-sm"
              key={tag}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      {kind === "pdf" ? (
        pdfId && siteId ? (
          <PrivateAssetView
            assetId={pdfId}
            siteId={siteId}
            kind="pdf"
            title={title}
          />
        ) : (
          <p className="text-muted-foreground text-sm">PDF 파일이 없습니다.</p>
        )
      ) : Array.isArray(snapshot.blocks) ? (
        <Editor
          key={`snapshot-${revisionId}`}
          initialContent={snapshot.blocks as unknown as EditorDocument}
          editable={false}
          renderImage={renderImage}
        />
      ) : (
        <p className="text-muted-foreground text-sm">본문이 없습니다.</p>
      )}
    </article>
  );
}
function blockHasContent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(blockHasContent);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    key === "props"
      ? blockHasContent(child)
      : key !== "id" && key !== "type" && blockHasContent(child),
  );
}
export function Composer({ postId }: { postId?: string }) {
  const router = useRouter();
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [siteId, setSiteId] = useState("");
  const me = useTravelQuery(
    api,
    "me",
    {},
    { siteId, actor: "session" },
    { enabled: !!siteId },
  );
  const mutationScope = { siteId, actor: me.data?.user_id ?? "session" };
  const createPost = useTravelMutation(api, "admin.post.create", mutationScope);
  const savePost = useTravelMutation(api, "admin.post.save", mutationScope);
  const submitSave = savePost.submit;
  const publishPost = useTravelMutation(
    api,
    "admin.post.publish",
    mutationScope,
  );
  const changePostStatus = useTravelMutation(
    api,
    "admin.post.status",
    mutationScope,
  );
  const restoreRevision = useTravelMutation(
    api,
    "admin.revision.restore",
    mutationScope,
  );
  const deleteRevision = useTravelMutation(
    api,
    "admin.revision.delete",
    mutationScope,
  );
  const [insertImage, setInsertImage] =
    useState<(assetId: string, caption?: string) => void>();
  const [coverAssetId, setCoverAssetId] = useState("");
  const [pdfAssetId, setPdfAssetId] = useState("");
  const [post, setPost] = useState<PostDraft>();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]["code"]>("day-walk");
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [metadataError, setMetadataError] = useState("");
  const [document, setDocument] = useState<EditorDocument>([
    { type: "paragraph", content: "여행의 첫 장면을 적어 보세요." },
  ]);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [autoSaveBlocked, setAutoSaveBlocked] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [latestDraft, setLatestDraft] = useState<PostDraft>();
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>();
  const [revisionOffset, setRevisionOffset] = useState(0);
  const savingRef = useRef(false);
  const editVersionRef = useRef(0);
  const loadedPostIdRef = useRef<string | undefined>(undefined);
  const published = useTravelQuery(
    api,
    "admin.post.published",
    { id: postId ?? EMPTY_ID },
    mutationScope,
    { enabled: !!postId && !!siteId && post?.status === "published" },
  );
  const revisions = useTravelQuery(
    api,
    "admin.revisions",
    {
      id: postId ?? EMPTY_ID,
      limit: 20,
      offset: revisionOffset,
    },
    mutationScope,
    { enabled: !!postId },
  );
  const revisionDetail = useTravelQuery(
    api,
    "admin.revision.get",
    { id: postId ?? EMPTY_ID, revision_id: selectedRevisionId ?? EMPTY_ID },
    mutationScope,
    { enabled: !!postId && !!selectedRevisionId },
  );

  function applyDraft(draft: PostDraft) {
    const content = draft.draft_content;
    setPost(draft);
    setLastSavedAt(draft.updated_at);
    setTitle(typeof content.title === "string" ? content.title : "");
    setSlug(typeof content.slug === "string" ? content.slug : "");
    setTags(
      Array.isArray(content.tags)
        ? content.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
    );
    setTagsText(
      Array.isArray(content.tags)
        ? content.tags
            .filter((tag): tag is string => typeof tag === "string")
            .join(", ")
        : "",
    );
    setSlugEdited(typeof content.slug === "string" && content.slug.length > 0);
    const found = CATEGORIES.find(
      (item) => item.code === content.category_code,
    );
    if (found) setCategory(found.code);
    setMetadata(
      content.metadata &&
        typeof content.metadata === "object" &&
        !Array.isArray(content.metadata)
        ? (content.metadata as Record<string, unknown>)
        : {},
    );
    if (Array.isArray(content.blocks))
      setDocument(content.blocks as EditorDocument);
    setEditorEpoch((current) => current + 1);
    setCoverAssetId(
      typeof content.cover_asset_id === "string" ? content.cover_asset_id : "",
    );
    setPdfAssetId(
      typeof content.pdf_asset_id === "string" ? content.pdf_asset_id : "",
    );
  }

  function markDirty() {
    editVersionRef.current += 1;
    setDirty(true);
    setSaveError("");
    setMutationError(null);
    setAutoSaveBlocked(false);
  }

  function updateMetadata(key: string, value: string) {
    setMetadata((current) => ({ ...current, [key]: value }));
    setMetadataError("");
    markDirty();
  }

  useEffect(() => {
    let active = true;
    void api
      .getSite()
      .then((site) => active && setSiteId(site.id))
      .catch((error: unknown) => active && setLoadError(error));
    if (postId && loadedPostIdRef.current !== postId) {
      void api
        .call("admin.post.get", { id: postId })
        .then((draft) => {
          if (!active) return;
          loadedPostIdRef.current = postId;
          applyDraft(draft);
        })
        .catch((error: unknown) => active && setLoadError(error));
    }
    return () => {
      active = false;
    };
  }, [api, postId, loadAttempt]);

  function retryInitialLoad() {
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }

  const onEditorReady = useCallback(
    (insert: (assetId: string, caption?: string) => void) =>
      setInsertImage(() => insert),
    [],
  );
  const handleEditorImageUpload = useCallback(
    (file: File) => {
      if (!siteId)
        return Promise.reject(new Error("사이트 정보를 불러오는 중입니다."));
      return uploadEditorImage(siteId, file);
    },
    [siteId],
  );
  const renderEditorImage = useCallback(
    (assetId: string) =>
      siteId ? (
        <PrivateAssetView
          assetId={assetId}
          siteId={siteId}
          kind="image"
          title="본문 사진"
        />
      ) : (
        <p role="status">사진을 불러오는 중…</p>
      ),
    [siteId],
  );

  const saveDraft = useCallback(
    async (checkpoint = false) => {
      if (!post || savingRef.current) return false;
      if (post.kind === "article") {
        const validationError = validateDraftMetadata(
          category as Exclude<
            (typeof CATEGORIES)[number]["code"],
            "itinerary-pdf"
          >,
          metadata,
        );
        if (validationError) {
          setMetadataError(validationError);
          setSaveError(
            validationError === "invalid_date"
              ? "날짜를 다시 확인해 주세요."
              : validationError === "invalid_dates"
                ? "종료일은 시작일 이후로 선택해 주세요."
                : "카페 또는 음식점 중 하나를 선택해 주세요.",
          );
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
        const content = (
          dirty
            ? JSON.parse(
                JSON.stringify({
                  ...post.draft_content,
                  title: title.trim(),
                  slug: slug.trim(),
                  tags,
                  category_code:
                    post.kind === "pdf" ? "itinerary-pdf" : category,
                  ...(post.kind === "article" ? { metadata } : {}),
                  ...(post.kind === "article"
                    ? { blocks: document, cover_asset_id: coverAssetId || null }
                    : { pdf_asset_id: pdfAssetId || null }),
                }),
              )
            : post.draft_content
        ) as ActionInput<"admin.post.save">["content"];
        const saved = await submitSave({
          id: post.id,
          version: post.lock_version,
          content,
          checkpoint,
        });
        setPost(saved);
        if (
          post.kind === "article" &&
          saved.draft_content.metadata &&
          typeof saved.draft_content.metadata === "object" &&
          !Array.isArray(saved.draft_content.metadata)
        ) {
          setMetadata(saved.draft_content.metadata as Record<string, unknown>);
        }
        setLastSavedAt(saved.updated_at);
        // Keep changes made during this request dirty for the next idle save.
        setDirty(editVersionRef.current !== editVersionAtStart);
        setAutoSaveBlocked(false);
        setSaveError("");
        setMutationError(null);
        return true;
      } catch (error) {
        if (error instanceof TravelApiError) setMutationError(error);
        setSaveError(
          error instanceof TravelApiError
            ? ""
            : "저장하지 못했습니다. 입력 내용은 화면에 남아 있습니다.",
        );
        setAutoSaveBlocked(true);
        if (error instanceof TravelApiError && error.status === 409) {
          setSaveError(
            "다른 탭이나 기기에서 글이 변경됐습니다. 내 입력은 유지되어 있습니다.",
          );
          void api
            .call("admin.post.get", { id: post.id })
            .then(setLatestDraft)
            .catch(() =>
              setSaveError(
                "최신본을 불러오지 못했습니다. 내 입력은 그대로 보존했습니다.",
              ),
            );
        }
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [
      api,
      category,
      coverAssetId,
      dirty,
      document,
      metadata,
      pdfAssetId,
      post,
      slug,
      submitSave,
      tags,
      title,
    ],
  );

  const publishChecks = post
    ? post.kind === "article"
      ? [
          {
            label: "제목과 주소 이름",
            valid: title.trim().length > 0 && slug.trim().length > 0,
          },
          {
            label: "분류별 여행 정보",
            valid: !validateDraftMetadata(
              category as Exclude<
                (typeof CATEGORIES)[number]["code"],
                "itinerary-pdf"
              >,
              metadata,
            ),
          },
          { label: "본문 내용", valid: document.some(blockHasContent) },
          { label: "대표 사진", valid: !!coverAssetId },
        ]
      : [
          {
            label: "제목과 주소 이름",
            valid: title.trim().length > 0 && slug.trim().length > 0,
          },
          { label: "일정 PDF 파일", valid: !!pdfAssetId },
        ]
    : [];

  async function restoreSnapshot(revisionId: string) {
    if (
      !post ||
      !window.confirm(
        "이 수정 이력을 현재 초안으로 복원할까요? 현재 초안은 이력으로 남습니다.",
      )
    )
      return;
    setBusy(true);
    setMutationError(null);
    try {
      let version = post.lock_version;
      if (dirty) {
        if (!(await saveDraft()))
          throw new Error(
            "저장되지 않은 입력을 먼저 저장해야 복원할 수 있습니다. 입력은 그대로 남아 있습니다.",
          );
        const latest = await api.call("admin.post.get", { id: post.id });
        version = latest.lock_version;
      }
      applyDraft(
        await restoreRevision.submit({
          id: post.id,
          version,
          revision_id: revisionId,
        }),
      );
      setDirty(false);
      setLatestDraft(undefined);
      setSelectedRevisionId(undefined);
      setRevisionOffset(0);
      void revisions.refetch();
      setMessage("선택한 수정 이력을 복원했습니다.");
    } catch (error) {
      if (error instanceof TravelApiError && error.status !== 409)
        setMutationError(error);
      setSaveError(
        error instanceof TravelApiError && error.status === 409
          ? "복원 중 글이 변경됐습니다. 최신본을 다시 불러와 주세요."
          : error instanceof TravelApiError
            ? ""
            : error instanceof Error
              ? error.message
              : "수정 이력을 복원하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function permanentlyDeleteRevision(revisionId: string) {
    if (
      !post ||
      !window.confirm(
        "이 수정 이력을 완전히 삭제할까요? 삭제한 이력은 복구할 수 없습니다.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    setMutationError(null);
    try {
      await deleteRevision.submit({
        id: post.id,
        version: post.lock_version,
        revision_id: revisionId,
      });
      if (selectedRevisionId === revisionId) setSelectedRevisionId(undefined);
      const refreshed = await revisions.refetch();
      if (!refreshed.data?.length && revisionOffset > 0)
        setRevisionOffset(Math.max(0, revisionOffset - 20));
      setMessage("수정 이력을 완전히 삭제했습니다.");
    } catch (error) {
      if (
        error instanceof TravelApiError &&
        error.status !== 409 &&
        error.code !== "published_revision_protected"
      )
        setMutationError(error);
      setMessage(
        error instanceof TravelApiError &&
          error.code === "published_revision_protected"
          ? "게시본에 연결된 이력은 삭제할 수 없습니다. 새 공개본으로 업데이트한 뒤 다시 시도해 주세요."
          : error instanceof TravelApiError && error.status === 409
            ? "그 사이 글이 변경됐습니다. 새로고침한 뒤 다시 시도해 주세요."
            : error instanceof TravelApiError
              ? ""
              : "수정 이력을 삭제하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!post) return;
    const missing = publishChecks
      .filter((check) => !check.valid)
      .map((check) => check.label);
    if (post.kind === "article" && missing.length) {
      setMessage(`발행 전에 확인해 주세요: ${missing.join(", ")}`);
      setPreview(true);
      return;
    }
    const updating = post.status === "published";
    if (
      !window.confirm(
        `“${title || "제목 없는 글"}”의 ${updating ? "현재 공개본을 수정 초안으로 업데이트" : "글을 공개 발행"}할까요?`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    setMutationError(null);
    try {
      if (dirty) {
        if (!(await saveDraft()))
          throw new Error(
            "초안을 저장하지 못해 발행을 중단했습니다. 입력은 그대로 보존했습니다.",
          );
        setBusy(true);
      }
      const latest = await api.call("admin.post.get", { id: post.id });
      await publishPost.submit({
        id: latest.id,
        site_id: latest.site_id,
        version: latest.lock_version,
      });
      applyDraft({
        ...latest,
        status: "published",
        lock_version: latest.lock_version + 1,
      });
      setDirty(false);
      void published.refetch();
      setRevisionOffset(0);
      void revisions.refetch();
      setMessage(
        updating
          ? "수정한 내용을 공개본에 반영했습니다."
          : "글을 공개 발행했습니다.",
      );
    } catch (error) {
      if (error instanceof TravelApiError) setMutationError(error);
      setMessage(
        error instanceof TravelApiError
          ? ""
          : error instanceof Error
            ? error.message
            : "발행하지 못했습니다.",
      );
      if (error instanceof TravelApiError && error.status === 409)
        void api
          .call("admin.post.get", { id: post.id })
          .then(setLatestDraft)
          .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: "private" | "trashed") {
    if (!post) return;
    const label = next === "private" ? "비공개로 전환" : "휴지통으로 이동";
    if (
      !window.confirm(
        `“${title || "제목 없는 글"}”을(를) ${label}할까요?${next === "trashed" ? " 게시 중인 글은 공개 목록에서 즉시 숨겨집니다." : ""}`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    setMutationError(null);
    try {
      if (dirty) {
        if (!(await saveDraft()))
          throw new Error(
            "먼저 초안을 저장해야 합니다. 입력은 그대로 보존했습니다.",
          );
        setBusy(true);
      }
      const latest = await api.call("admin.post.get", { id: post.id });
      const result = await changePostStatus.submit({
        id: latest.id,
        site_id: latest.site_id,
        version: latest.lock_version,
        status: next,
      });
      applyDraft({
        ...latest,
        status: result.status,
        lock_version: result.version,
      });
      setDirty(false);
      setMessage(
        next === "private"
          ? "글을 비공개로 전환했습니다."
          : "글을 휴지통으로 옮겼습니다.",
      );
    } catch (error) {
      if (error instanceof TravelApiError) setMutationError(error);
      setMessage(
        error instanceof TravelApiError
          ? ""
          : error instanceof Error
            ? error.message
            : "상태를 변경하지 못했습니다. 다시 불러와 주세요.",
      );
      if (error instanceof TravelApiError && error.status === 409)
        void api
          .call("admin.post.get", { id: post.id })
          .then(setLatestDraft)
          .catch(() => undefined);
    } finally {
      setBusy(false);
    }
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
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank")
        return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname === window.location.pathname
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (
        !window.confirm(
          "저장되지 않은 변경이 있어요. 지금 저장한 뒤 이동할까요?",
        )
      )
        return;
      void saveDraft().then((saved) => {
        if (saved) router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.document.addEventListener("click", handleInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.document.removeEventListener(
        "click",
        handleInternalNavigation,
        true,
      );
    };
  }, [dirty, post, router, saveDraft]);

  async function create(kind: "article" | "pdf") {
    setBusy(true);
    setMessage("");
    setMutationError(null);
    try {
      if (!siteId) throw new Error("사이트 정보를 불러오는 중입니다.");
      const created = await createPost.submit({
        site_id: siteId,
        kind,
        content:
          kind === "pdf"
            ? { category_code: "itinerary-pdf" }
            : { category_code: "day-walk", blocks: [] },
      });
      router.replace(`/write/${created.id}`);
    } catch (error) {
      if (error instanceof TravelApiError) setMutationError(error);
      setMessage(
        error instanceof TravelApiError
          ? ""
          : error instanceof Error
            ? error.message
            : "새 글을 만들지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!postId)
    return (
      <main className="mx-auto max-w-4xl space-y-6 px-5 py-12 md:px-8">
        <p className="text-muted-foreground">오늘도 함께 걷다 · 글 관리</p>
        <h1 className="font-editorial text-3xl font-semibold">
          새 기록 시작하기
        </h1>
        <p>여행 글 또는 PDF 일정표를 선택해 주세요.</p>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy || !siteId}
            onClick={() => void create("article")}
          >
            여행 글 쓰기
          </Button>
          <Button
            variant="outline"
            disabled={busy || !siteId}
            onClick={() => void create("pdf")}
          >
            PDF 일정표 만들기
          </Button>
        </div>
        {message && <p role="status">{message}</p>}
        {mutationError !== null && <ApiMutationError error={mutationError} />}
        {loadError !== null && (
          <ApiErrorState error={loadError} onRetry={retryInitialLoad} />
        )}
      </main>
    );

  if (!post)
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        {loadError !== null ? (
          <ApiErrorState error={loadError} onRetry={retryInitialLoad} />
        ) : (
          <p role="status">{message || "글을 불러오고 있어요…"}</p>
        )}
      </main>
    );
  const hasUnpublishedDraft =
    post.status === "published" &&
    (dirty ||
      (published.isSuccess &&
        (!published.data ||
          hasUnpublishedChanges(post.draft_content, published.data.snapshot))));
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-12 md:px-8">
      {loadError !== null && (
        <ApiErrorState error={loadError} onRetry={retryInitialLoad} />
      )}
      {mutationError !== null && <ApiMutationError error={mutationError} />}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground">
            {post.status === "published" ? "공개 글 수정" : "초안 편집"}
          </p>
          <h1 className="font-editorial mt-2 text-3xl font-semibold">
            {post.kind === "pdf" ? "PDF 일정표" : "여행 기록"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {post.kind === "article" && (
            <Button variant="outline" onClick={() => setPreview(!preview)}>
              {preview ? "이어서 쓰기" : "미리보기"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void changeStatus("trashed")}
          >
            휴지통
          </Button>
          {post.status === "published" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void changeStatus("private")}
            >
              비공개
            </Button>
          )}
          {post.status !== "trashed" && (
            <Button
              disabled={
                busy ||
                saving ||
                (post.status === "published" &&
                  (!published.isSuccess || !hasUnpublishedDraft))
              }
              onClick={() => void publish()}
            >
              {post.status === "published" ? "공개본 업데이트" : "발행"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy || saving}
            onClick={() =>
              void saveDraft(true).then((saved) => {
                if (saved) {
                  setMessage(
                    "초안을 저장했습니다. 변경된 내용은 수정 이력에 기록됩니다.",
                  );
                  setRevisionOffset(0);
                  void revisions.refetch();
                }
              })
            }
          >
            {saving || busy ? "저장 중…" : "초안 저장 · 이력 남기기"}
          </Button>
        </div>
      </header>
      <p
        className="text-muted-foreground text-sm"
        role="status"
        aria-live="polite"
      >
        {busy || saving
          ? "저장 중…"
          : saveError
            ? `저장 실패: ${saveError}`
            : dirty
              ? "저장되지 않은 변경 사항 · 자동 저장 대기 중"
              : lastSavedAt
                ? `마지막 저장: ${new Date(lastSavedAt).toLocaleString("ko-KR")}`
                : "저장된 변경 사항 없음"}
      </p>
      {post.status === "published" && (
        <aside
          className="rounded-panel space-y-3 border border-emerald-200 bg-emerald-50 p-5"
          aria-label="공개본과 수정 초안 상태"
        >
          <h2 className="font-semibold">현재 공개본과 수정 초안</h2>
          <p className="text-sm leading-relaxed">
            방문자는 아래의 현재 공개본을 보고 있습니다. 이 화면에서 수정하거나
            초안을 저장해도 공개 글은 바뀌지 않습니다. 수정이 끝나면
            <strong> 공개본 업데이트</strong>를 눌러 변경 사항을 공개하세요.
          </p>
          <p className="text-sm font-medium">
            {published.isPending
              ? "공개본을 확인하고 있습니다…"
              : published.isError
                ? "공개본을 불러오지 못했습니다. 새로고침해 주세요."
                : published.data === null
                  ? "현재 공개본을 찾지 못했습니다."
                  : hasUnpublishedDraft
                    ? "공개본에 반영되지 않은 수정 초안이 있습니다."
                    : "수정 초안과 공개본이 같습니다."}
          </p>
          {published.isError && (
            <ApiErrorState
              error={published.error}
              onRetry={() => void published.refetch()}
              isRetrying={published.isFetching}
            />
          )}
        </aside>
      )}
      {post.status === "published" && published.data && (
        <details
          open
          className="rounded-panel border p-4"
          aria-label="현재 공개 중인 글"
        >
          <summary className="cursor-pointer font-semibold">
            현재 공개 중인 글 ·{" "}
            {new Date(published.data.updated_at).toLocaleString("ko-KR")}
          </summary>
          <p className="text-muted-foreground mt-2 mb-4 text-sm">
            이 내용은 읽기 전용이며, 공개본 업데이트 전까지 방문자에게
            표시됩니다.
          </p>
          <div className="max-h-[40rem] overflow-y-auto">
            <SnapshotView
              snapshot={published.data.snapshot}
              kind={post.kind}
              siteId={siteId}
              revisionId={published.data.revision_id}
              renderImage={renderEditorImage}
            />
          </div>
        </details>
      )}
      {latestDraft && (
        <aside
          className="rounded-panel space-y-3 border border-amber-500 p-4"
          aria-label="버전 충돌 해결"
        >
          <h2 className="font-semibold">최신 저장본과 충돌</h2>
          <p>
            최신본 v{latestDraft.lock_version} ·{" "}
            {new Date(latestDraft.updated_at).toLocaleString("ko-KR")} · 제목:{" "}
            {typeof latestDraft.draft_content.title === "string"
              ? latestDraft.draft_content.title || "(제목 없음)"
              : "(제목 없음)"}
          </p>
          <p>
            현재 입력은 별도로 유지됩니다. 최신본으로 교체하거나, 최신 버전을
            기준으로 현재 입력을 다시 저장할 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                applyDraft(latestDraft);
                setDirty(false);
                setLatestDraft(undefined);
                setSaveError("");
              }}
            >
              최신본으로 교체
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setPost(latestDraft);
                setLatestDraft(undefined);
                markDirty();
              }}
            >
              최신 버전에 내 입력 저장
            </Button>
          </div>
        </aside>
      )}
      <label className="block space-y-2">
        글 제목
        <Input
          disabled={busy}
          value={title}
          maxLength={150}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setTitle(value);
            if (!slugEdited) {
              const suggestedSlug = value
                .toLocaleLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 120);
              setSlug(suggestedSlug || `travel-note-${postId.slice(0, 8)}`);
            }
            markDirty();
          }}
        />
      </label>
      <label className="block space-y-2">
        주소 이름
        <Input
          disabled={busy}
          value={slug}
          maxLength={120}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.currentTarget.value);
            markDirty();
          }}
        />
      </label>
      {post.kind === "article" && (
        <label className="block space-y-2">
          태그
          <Input
            disabled={busy}
            value={tagsText}
            maxLength={300}
            placeholder="쉼표로 구분해 입력 (예: 제주, 가족여행)"
            onChange={(event) => {
              const value = event.currentTarget.value;
              setTagsText(value);
              setTags(
                [
                  ...new Set(
                    value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  ),
                ].slice(0, 10),
              );
              markDirty();
            }}
          />
        </label>
      )}
      {post.kind === "article" && (
        <label className="block space-y-2">
          분류
          <Select
            disabled={busy}
            value={category}
            onValueChange={(value) => {
              setCategory(value as typeof category);
              setMetadataError("");
              markDirty();
            }}
          >
            <SelectTrigger aria-label="분류 선택">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.filter((item) => item.code !== "itinerary-pdf").map(
                (item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </label>
      )}
      {post.kind === "article" && (
        <fieldset className="rounded-panel space-y-4 border p-5">
          <legend className="px-2 font-semibold">여행 정보</legend>
          <p className="text-muted-foreground text-sm">
            초안은 비워 두어도 저장됩니다. 별표 항목은 공개 발행 전에
            필요합니다.
          </p>
          <label className="block space-y-2">
            지역명 *
            <Input
              disabled={busy}
              value={typeof metadata.region === "string" ? metadata.region : ""}
              maxLength={100}
              onChange={(event) =>
                updateMetadata("region", event.currentTarget.value)
              }
              placeholder="예: 제주 서귀포"
            />
          </label>
          {(category === "day-walk" || category === "food-cafe") && (
            <label className="block space-y-2">
              방문일 *
              <Input
                disabled={busy}
                type="date"
                value={
                  typeof metadata.visited_on === "string"
                    ? metadata.visited_on
                    : ""
                }
                onChange={(event) =>
                  updateMetadata("visited_on", event.currentTarget.value)
                }
              />
            </label>
          )}
          {category === "overnight-trip" && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2">
                여행 시작일 *
                <Input
                  disabled={busy}
                  type="date"
                  value={
                    typeof metadata.start_date === "string"
                      ? metadata.start_date
                      : ""
                  }
                  onChange={(event) =>
                    updateMetadata("start_date", event.currentTarget.value)
                  }
                />
              </label>
              <label className="block space-y-2">
                여행 종료일 *
                <Input
                  disabled={busy}
                  type="date"
                  min={
                    typeof metadata.start_date === "string"
                      ? metadata.start_date
                      : undefined
                  }
                  value={
                    typeof metadata.end_date === "string"
                      ? metadata.end_date
                      : ""
                  }
                  onChange={(event) =>
                    updateMetadata("end_date", event.currentTarget.value)
                  }
                />
              </label>
            </div>
          )}
          {category === "stay-review" && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2">
                체크인 *
                <Input
                  disabled={busy}
                  type="date"
                  value={
                    typeof metadata.check_in === "string"
                      ? metadata.check_in
                      : ""
                  }
                  onChange={(event) =>
                    updateMetadata("check_in", event.currentTarget.value)
                  }
                />
              </label>
              <label className="block space-y-2">
                체크아웃 *
                <Input
                  disabled={busy}
                  type="date"
                  min={
                    typeof metadata.check_in === "string"
                      ? metadata.check_in
                      : undefined
                  }
                  value={
                    typeof metadata.check_out === "string"
                      ? metadata.check_out
                      : ""
                  }
                  onChange={(event) =>
                    updateMetadata("check_out", event.currentTarget.value)
                  }
                />
              </label>
            </div>
          )}
          {(category === "food-cafe" || category === "stay-review") && (
            <label className="block space-y-2">
              {category === "food-cafe" ? "장소명 *" : "숙소명 *"}
              <Input
                disabled={busy}
                value={
                  typeof metadata.place_name === "string"
                    ? metadata.place_name
                    : ""
                }
                maxLength={150}
                onChange={(event) =>
                  updateMetadata("place_name", event.currentTarget.value)
                }
                placeholder={
                  category === "food-cafe"
                    ? "예: 바다 앞 작은 카페"
                    : "예: 서귀포 바다 숙소"
                }
              />
            </label>
          )}
          {category === "food-cafe" && (
            <label className="block space-y-2">
              장소 종류 *
              <Select
                disabled={busy}
                value={
                  typeof metadata.venue_type === "string" && metadata.venue_type
                    ? metadata.venue_type
                    : undefined
                }
                onValueChange={(value) => updateMetadata("venue_type", value)}
              >
                <SelectTrigger aria-label="장소 종류 선택">
                  <SelectValue placeholder="종류를 선택해 주세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cafe">카페</SelectItem>
                  <SelectItem value="restaurant">음식점</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
          {metadataError && (
            <p role="alert">
              {metadataError === "invalid_date"
                ? "날짜를 다시 확인해 주세요."
                : metadataError === "invalid_dates"
                  ? "종료일은 시작일 이후로 선택해 주세요."
                  : "카페 또는 음식점 중 하나를 선택해 주세요."}
            </p>
          )}
        </fieldset>
      )}
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
      <section
        className="rounded-panel space-y-4 border p-4"
        aria-label="수정 이력"
      >
        <div className="space-y-1">
          <h2 className="font-semibold">수정 이력</h2>
          <p className="text-muted-foreground text-sm">
            직접 저장하거나 공개본을 업데이트할 때의 내용을 보관합니다. 자동
            저장은 초안만 갱신합니다.
          </p>
        </div>
        {revisions.data?.length ? (
          <ul className="space-y-3">
            {revisions.data.map((revision) => (
              <li
                className="space-y-3 rounded-lg border bg-white p-4"
                key={revision.id}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span className="rounded-full bg-stone-100 px-2.5 py-1">
                    {revision.reason === "published"
                      ? "공개본 업데이트"
                      : revision.reason === "before_restore"
                        ? "복원 전 초안"
                        : "직접 저장"}
                  </span>
                  {revision.is_published && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">
                      {post.status === "published"
                        ? "현재 공개본"
                        : "마지막 게시본"}
                    </span>
                  )}
                  {revision.post_version !== null && (
                    <span className="text-muted-foreground">
                      글 버전 {revision.post_version}
                    </span>
                  )}
                  <time
                    className="text-muted-foreground"
                    dateTime={revision.created_at}
                  >
                    {new Date(revision.created_at).toLocaleString("ko-KR")}
                  </time>
                </div>
                <div>
                  <p className="font-medium">{revision.title || "제목 없음"}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {revision.excerpt || "본문 미입력"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setSelectedRevisionId(
                        selectedRevisionId === revision.id
                          ? undefined
                          : revision.id,
                      )
                    }
                  >
                    {selectedRevisionId === revision.id
                      ? "내용 닫기"
                      : "내용 보기"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || saving}
                    onClick={() => void restoreSnapshot(revision.id)}
                  >
                    이 이력 복원
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || saving || revision.is_published}
                    title={
                      revision.is_published
                        ? "게시본에 연결된 이력은 새 공개본으로 업데이트한 뒤 삭제할 수 있습니다."
                        : undefined
                    }
                    onClick={() => void permanentlyDeleteRevision(revision.id)}
                  >
                    영구 삭제
                  </Button>
                </div>
                {selectedRevisionId === revision.id && (
                  <div
                    className="space-y-2 border-t pt-4"
                    aria-label="선택한 수정 이력 내용"
                  >
                    {revisionDetail.isPending ? (
                      <p role="status">이력 내용을 불러오는 중…</p>
                    ) : revisionDetail.isError || !revisionDetail.data ? (
                      <ApiErrorState
                        error={revisionDetail.error}
                        onRetry={() => void revisionDetail.refetch()}
                        isRetrying={revisionDetail.isFetching}
                      />
                    ) : (
                      <SnapshotView
                        snapshot={revisionDetail.data.snapshot}
                        kind={post.kind}
                        siteId={siteId}
                        revisionId={revision.id}
                        renderImage={renderEditorImage}
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : revisions.isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            이력을 불러오는 중…
          </p>
        ) : revisions.isError ? (
          <ApiErrorState
            error={revisions.error}
            onRetry={() => void revisions.refetch()}
            isRetrying={revisions.isFetching}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            저장된 수정 이력이 없습니다. 초안을 직접 저장하면 이력이 남습니다.
          </p>
        )}
        {(revisionOffset > 0 || (revisions.data?.length ?? 0) === 20) && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={revisionOffset === 0 || busy}
              onClick={() => {
                setSelectedRevisionId(undefined);
                setRevisionOffset(Math.max(0, revisionOffset - 20));
              }}
            >
              더 최신 이력
            </Button>
            <Button
              variant="outline"
              disabled={(revisions.data?.length ?? 0) < 20 || busy}
              onClick={() => {
                setSelectedRevisionId(undefined);
                setRevisionOffset(revisionOffset + 20);
              }}
            >
              이전 이력
            </Button>
          </div>
        )}
      </section>
      {post.kind === "article" && (
        <section
          className="rounded-panel space-y-3 border p-4"
          aria-label={preview ? "공개 미리보기" : "본문 편집기"}
        >
          {preview ? (
            <article className="mx-auto max-w-2xl space-y-5 py-6">
              <p className="text-muted-foreground text-sm">
                {CATEGORIES.find((item) => item.code === category)?.label} ·{" "}
                {typeof metadata.region === "string"
                  ? metadata.region
                  : "지역 미입력"}
              </p>
              <h2 className="font-editorial text-3xl font-semibold">
                {title || "제목을 입력해 주세요"}
              </h2>
              {coverAssetId && siteId && (
                <PrivateAssetView
                  assetId={coverAssetId}
                  siteId={siteId}
                  kind="image"
                  title="대표 사진 미리보기"
                />
              )}
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    className="rounded-full bg-stone-100 px-3 py-1 text-sm"
                    key={tag}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              <Editor
                key={`${post.id}-preview`}
                initialContent={document}
                editable={false}
                renderImage={renderEditorImage}
              />
            </article>
          ) : (
            <>
              <Editor
                key={`${post.id}-edit-${editorEpoch}`}
                initialContent={document}
                editable={!busy}
                onChange={(nextDocument) => {
                  if (JSON.stringify(nextDocument) === JSON.stringify(document))
                    return;
                  setDocument(nextDocument);
                  markDirty();
                }}
                onReady={onEditorReady}
                onUploadImage={handleEditorImageUpload}
                renderImage={renderEditorImage}
                onError={setEditorError}
              />
              {editorError && (
                <p role="alert" className="text-sm text-red-700">
                  {editorError}
                </p>
              )}
            </>
          )}
        </section>
      )}
      {post.kind === "article" && preview && (
        <section
          className="rounded-panel space-y-2 border p-4"
          aria-label="발행 전 확인"
        >
          <h2 className="font-semibold">발행 전 확인</h2>
          <ul>
            {publishChecks.map((check) => (
              <li key={check.label}>
                {check.valid ? "✓" : "○"} {check.label}
              </li>
            ))}
          </ul>
          <p>
            {publishChecks.every((check) => check.valid)
              ? "필수 항목이 준비되었습니다. 발행은 별도 확인 후 진행합니다."
              : "비어 있는 항목을 채우면 발행할 수 있습니다."}
          </p>
        </section>
      )}
      {siteId &&
        (post.kind === "pdf" ? (
          <MediaUpload
            key="pdf-upload"
            siteId={siteId}
            kindFilter="pdf"
            onSelectPdf={(assetId) => {
              setPdfAssetId(assetId);
              markDirty();
            }}
          />
        ) : (
          <MediaUpload
            key="image-upload"
            siteId={siteId}
            kindFilter="image"
            onInsertImage={(assetId, caption) => {
              insertImage?.(assetId, caption);
              markDirty();
            }}
            onSetCoverImage={(assetId) => {
              setCoverAssetId(assetId);
              markDirty();
            }}
          />
        ))}
      {siteId && coverAssetId && (
        <section
          className="space-y-2 rounded-lg border p-4"
          aria-label="대표 사진 미리보기"
        >
          <h2 className="font-medium">선택한 대표 사진</h2>
          <PrivateAssetView
            assetId={coverAssetId}
            siteId={siteId}
            kind="image"
            title="대표 사진"
          />
        </section>
      )}
      {siteId && pdfAssetId && (
        <section
          className="space-y-2 rounded-lg border p-4"
          aria-label="선택한 일정 PDF"
        >
          <h2 className="font-medium">선택한 일정 PDF</h2>
          <PrivateAssetView
            assetId={pdfAssetId}
            siteId={siteId}
            kind="pdf"
            title="일정 PDF"
          />
        </section>
      )}
    </main>
  );
}
