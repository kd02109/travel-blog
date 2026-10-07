import {
  AboutFeature,
  AboutHeading,
  AboutRecordTypes,
  AboutSiteSkeleton,
} from "./about-presentation";

export default function AboutLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-12 md:px-8 md:py-16 xl:px-16">
      <AboutHeading />
      <AboutFeature>
        <AboutSiteSkeleton />
      </AboutFeature>
      <AboutRecordTypes />
    </main>
  );
}
