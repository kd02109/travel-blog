// Register the schedule only after the release gate and paid Cron cadence are
// approved. Preview and initial production deployments use direct calls.
export const config = {
  crons:
    process.env.VERCEL_ENV === "production" &&
    process.env.TRAVEL_MEDIA_CRON_ENABLED === "true"
      ? [{ path: "/api/internal/media-worker", schedule: "* * * * *" }]
      : [],
};
