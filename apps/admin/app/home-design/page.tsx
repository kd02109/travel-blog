const templates = [
  {
    name: "A · 여백의 여행책",
    description: "넓은 여백과 세로 사진으로 펼치는 여행책",
  },
  {
    name: "B · 숲과 물 사이",
    description: "풍경 사진 두 장과 깊은 초록을 담는 표지",
  },
  { name: "C · 길을 따라", description: "여행의 이동과 장면을 따라 읽는 구성" },
  {
    name: "D · 한 장의 엽서",
    description: "큰 풍경 사진과 종이 엽서가 겹치는 표지",
  },
];

export default function HomeDesign() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <p className="text-muted-foreground text-sm tracking-widest">
        SITE APPEARANCE
      </p>
      <h1 className="mt-2 text-3xl font-semibold">홈 디자인</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl text-base">
        네 가지 표지 방향을 확인할 수 있습니다. 선택·미리보기·공개 적용은 다음
        디자인 관리 단계에서 연결합니다.
      </p>
      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {templates.map((template) => {
          const active = template.name.startsWith("D ·");
          return (
            <li key={template.name}>
              <article
                className={`rounded-panel bg-surface flex min-h-48 flex-col justify-between border p-6 ${active ? "border-primary ring-primary/20 ring-2" : "border-border"}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold">{template.name}</h2>
                    {active && (
                      <span className="rounded-control bg-muted text-primary inline-flex min-h-8 items-center gap-2 px-3 text-sm font-medium">
                        ✓ 기본 방향
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-4 text-base">
                    {template.description}
                  </p>
                </div>
                {active && (
                  <p className="border-border text-muted-foreground mt-6 border-t pt-4 text-sm">
                    기본 홈 D · 한 장의 엽서
                  </p>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
