import { initAnalytics } from "@app-analytics/browser-sdk";

export const analytics = initAnalytics({
  writeKey: import.meta.env.VITE_WRITE_KEY || "dev-write-key-change-me",
  endpoint: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000",
  autoPageViews: true,
});
