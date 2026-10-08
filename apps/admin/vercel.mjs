// Preview deployments exercise this route directly. Scheduled delivery starts
// only on a production deployment, after the media worker release gate passes.
export const config = {
  crons:
    process.env.VERCEL_ENV === "production"
      ? [{ path: "/api/internal/media-worker", schedule: "* * * * *" }]
      : [],
};
