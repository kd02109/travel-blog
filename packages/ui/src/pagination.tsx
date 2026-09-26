import { Button } from "./button";

export function Pagination({
  page,
  hasNextPage,
  onPageChange,
  busy = false,
}: {
  page: number;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
  busy?: boolean;
}) {
  return (
    <nav
      aria-label="페이지 이동"
      className="flex min-h-12 items-center justify-center gap-3"
    >
      <Button
        type="button"
        variant="outline"
        disabled={busy || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        이전
      </Button>
      <span aria-current="page" className="min-w-24 text-center text-base">
        {page} 페이지
      </span>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !hasNextPage}
        onClick={() => onPageChange(page + 1)}
      >
        다음
      </Button>
    </nav>
  );
}
