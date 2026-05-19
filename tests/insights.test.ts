import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupInsights } from "../src/insights.js";
import type { Decision } from "../src/decide.js";

/** Build a realistic Decision shape for testing. */
function makeDecision(
  overrides: Partial<{
    action: Decision["action"];
    operator: string;
    name: string;
    category: string;
    verified: boolean;
  }> = {},
): Decision {
  return {
    action: overrides.action ?? "402",
    bot: {
      isBot: true,
      userAgent: "GPTBot/1.0",
      hasSignatureHeaders: false,
      signatureAgent: null,
      reasons: [],
      entry: {
        name: overrides.name ?? "GPTBot",
        operator: overrides.operator ?? "OpenAI",
        category: (overrides.category ?? "training") as never,
        userAgentPatterns: [],
        policyUrl: "",
      } as never,
    },
    authVerified: overrides.verified !== undefined
      ? ({ valid: overrides.verified, reason: overrides.verified ? "" : "no-sig" } as never)
      : undefined,
    reasons: Object.freeze([]),
  };
}

describe("setupInsights()", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
  });

  it("posts a six-field payload on every decision when sampleRate is 1.0", () => {
    const emit = setupInsights({
      installId: "test-install-1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    emit(makeDecision());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://insights.crawlertoll.com/v1/ingest");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      install_id: "test-install-1",
      operator: "OpenAI",
      bot_name: "GPTBot",
      action: "402",
      category: "training",
      verified: "false",
    });
  });

  it("honours a custom endpoint", () => {
    const emit = setupInsights({
      installId: "x",
      endpoint: "https://my-collector.example/ingest",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    emit(makeDecision());
    expect(fetchMock.mock.calls[0]![0]).toBe("https://my-collector.example/ingest");
  });

  it("marks verified=true when authVerified.valid is true", () => {
    const emit = setupInsights({
      installId: "x",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    emit(makeDecision({ verified: true }));
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.verified).toBe("true");
  });

  it("emits empty strings for missing bot metadata (unknown UAs)", () => {
    const emit = setupInsights({
      installId: "x",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const decision: Decision = {
      action: "allow",
      bot: {
        isBot: false,
        userAgent: "Mozilla/5.0",
        hasSignatureHeaders: false,
        signatureAgent: null,
        reasons: [],
        entry: null,
      },
      reasons: Object.freeze([]),
    };
    emit(decision);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toEqual({
      install_id: "x",
      operator: "",
      bot_name: "",
      action: "allow",
      category: "",
      verified: "false",
    });
  });

  it("drops events outside the sample rate", () => {
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(0.95); // above 0.1
    const emit = setupInsights({
      installId: "x",
      sampleRate: 0.1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    emit(makeDecision());
    expect(fetchMock).not.toHaveBeenCalled();
    randSpy.mockRestore();
  });

  it("includes events inside the sample rate", () => {
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(0.05); // below 0.1
    const emit = setupInsights({
      installId: "x",
      sampleRate: 0.1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    emit(makeDecision());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    randSpy.mockRestore();
  });

  it("clamps invalid sampleRate values into [0, 1]", () => {
    const e1 = setupInsights({ installId: "x", sampleRate: 5, fetchImpl: fetchMock as unknown as typeof fetch });
    e1(makeDecision());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(0.9);
    const e2 = setupInsights({ installId: "x", sampleRate: -1, fetchImpl: fetchMock as unknown as typeof fetch });
    e2(makeDecision());
    expect(fetchMock).not.toHaveBeenCalled();
    randSpy.mockRestore();
  });

  it("calls onError when fetch rejects, and does not throw to the caller", async () => {
    const failingFetch = vi.fn(() => Promise.reject(new Error("network down")));
    const onError = vi.fn();
    const emit = setupInsights({
      installId: "x",
      fetchImpl: failingFetch as unknown as typeof fetch,
      onError,
    });
    expect(() => emit(makeDecision())).not.toThrow();
    // Wait a microtask for the fire-and-forget promise to settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0]![0])).toContain("network down");
  });

  it("generates a per-process installId with a warning when none is provided", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const emit = setupInsights({ fetchImpl: fetchMock as unknown as typeof fetch });
    emit(makeDecision());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.install_id).toMatch(/^[0-9a-f-]{36}$|^ct-fallback-/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("returns immediately and never throws synchronously", () => {
    const throwingFetch = vi.fn(() => {
      throw new Error("synchronous throw");
    });
    const onError = vi.fn();
    const emit = setupInsights({
      installId: "x",
      fetchImpl: throwingFetch as unknown as typeof fetch,
      onError,
    });
    expect(() => emit(makeDecision())).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
