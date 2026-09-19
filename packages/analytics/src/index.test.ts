import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  supported: vi.fn(),
  init: vi.fn(() => ({})),
  collection: vi.fn(),
  consent: vi.fn(),
  log: vi.fn(),
}));
vi.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));
vi.mock("firebase/analytics", () => ({
  isSupported: mocks.supported,
  initializeAnalytics: mocks.init,
  setAnalyticsCollectionEnabled: mocks.collection,
  setConsent: mocks.consent,
  logEvent: mocks.log,
}));
const config = { apiKey: "public", appId: "app", measurementId: "G-test" };
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { origin: "https://example.com" } });
  mocks.supported.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllGlobals());
it("does not initialize before consent", async () => {
  const { setAnalyticsConsent } = await import("./index");
  await setAnalyticsConsent(false, config);
  expect(mocks.init).not.toHaveBeenCalled();
});
it("honors withdrawal while support detection is pending", async () => {
  let resolve!: (value: boolean) => void;
  mocks.supported.mockReturnValue(
    new Promise<boolean>((r) => {
      resolve = r;
    }),
  );
  const { setAnalyticsConsent } = await import("./index");
  const pending = setAnalyticsConsent(true, config);
  await setAnalyticsConsent(false, config);
  resolve(true);
  await pending;
  expect(mocks.init).not.toHaveBeenCalled();
});
it("strips query/hash and stops events after withdrawal", async () => {
  const { setAnalyticsConsent, trackPage } = await import("./index");
  await setAnalyticsConsent(true, config);
  trackPage("/posts/walk?token=secret#private");
  expect(mocks.log).toHaveBeenCalledWith(
    {},
    "page_view",
    expect.objectContaining({
      page_location: "https://example.com/posts/walk",
    }),
  );
  await setAnalyticsConsent(false, config);
  trackPage("/second");
  expect(mocks.log).toHaveBeenCalledTimes(1);
  expect(mocks.collection).toHaveBeenLastCalledWith({}, false);
});
