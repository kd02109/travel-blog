import {
  validatePublishedMetadata,
  type ArticleCategory,
} from "@repo/contracts";

export function publicationChecklist({
  kind,
  title,
  slug,
  tags,
  category,
  metadata,
  hasBodyContent,
  coverAssetId,
  pdfAssetId,
}: {
  kind: "article" | "pdf";
  title: string;
  slug: string;
  tags: string[];
  category: ArticleCategory;
  metadata: Record<string, unknown>;
  hasBodyContent: boolean;
  coverAssetId: string;
  pdfAssetId: string;
}) {
  const checks = [
    {
      label: "글 제목",
      valid: title.trim().length > 0 && title.trim().length <= 150,
    },
    { label: "주소 이름", valid: /^[a-z0-9][a-z0-9-]{0,119}$/.test(slug) },
    {
      label: "태그",
      valid:
        tags.length <= 20 &&
        tags.every((tag) => tag.trim().length > 0 && tag.trim().length <= 30),
    },
  ];

  if (kind === "pdf") {
    return [...checks, { label: "일정 PDF 파일", valid: !!pdfAssetId }];
  }

  return [
    ...checks,
    {
      label: "분류별 여행 정보",
      valid: validatePublishedMetadata(category, metadata) === null,
    },
    { label: "본문 내용", valid: hasBodyContent },
    { label: "대표 사진", valid: !!coverAssetId },
  ];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function hasUnpublishedChanges(
  savedDraft: Record<string, unknown>,
  publishedSnapshot: Record<string, unknown>,
): boolean {
  return (
    JSON.stringify(canonicalize(savedDraft)) !==
    JSON.stringify(canonicalize(publishedSnapshot))
  );
}
