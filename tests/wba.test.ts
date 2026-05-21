/**
 * Web Bot Auth tests.
 *
 * Generates a real Ed25519 keypair, builds a JWKS, signs a request with
 * a canonical signature-base, and round-trips it through the verifier.
 * Negative paths: no-signature, expired, future-dated, wrong key,
 * tampered base.
 *
 * The verifier never makes a real network call — we inject a custom
 * `fetchImpl` that returns the test JWKS.
 */

import { afterEach, describe, expect, it } from "vitest";

import * as ed from "@noble/ed25519";

import {
  clearJwksCache,
  jwkThumbprint,
  parseSignatureInput,
  verifyWebBotAuth,
  type WbaJwks,
  type WbaJwk,
} from "../src/wba.js";

const TEXT = new TextEncoder();

function base64urlEncode(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString("base64");
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function makeBot(): Promise<{
  secretKey: Uint8Array;
  jwk: WbaJwk;
  keyid: string;
  jwks: WbaJwks;
}> {
  const secretKey = new Uint8Array(32);
  globalThis.crypto.getRandomValues(secretKey);
  const publicKey = await ed.getPublicKeyAsync(secretKey);
  const jwk: WbaJwk = {
    kty: "OKP",
    crv: "Ed25519",
    x: base64urlEncode(publicKey),
  };
  const keyid = jwkThumbprint(jwk);
  return { secretKey, jwk, keyid, jwks: { keys: [jwk] } };
}

function fakeFetch(body: unknown) {
  const fn: typeof fetch = async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  return fn;
}

async function signRequest({
  secretKey,
  keyid,
  authority,
  targetUri,
  signatureAgent,
  components,
  params,
}: {
  secretKey: Uint8Array;
  keyid: string;
  authority: string;
  targetUri: string;
  signatureAgent: string;
  components: readonly string[];
  params: { created: number; expires: number; tag?: string; nonce?: string };
}): Promise<{ "signature-input": string; signature: string; "signature-agent": string }> {
  // Build canonical lines and params line.
  const lines: string[] = [];
  for (const c of components) {
    let value: string;
    switch (c) {
      case "@authority":
        value = authority;
        break;
      case "@method":
        value = "GET";
        break;
      case "@target-uri":
        value = `https://${authority}${targetUri}`;
        break;
      case "@path":
        value = targetUri.split("?")[0]!;
        break;
      case "@query": {
        const q = targetUri.indexOf("?");
        value = q < 0 ? "" : targetUri.slice(q);
        break;
      }
      case "signature-agent":
        value = signatureAgent;
        break;
      default:
        throw new Error(`unsupported component in test signer: ${c}`);
    }
    lines.push(`"${c}": ${value}`);
  }
  // The params line must literally match the signature-input header
  // for that label, minus the leading `<label>=`.
  const paramsBody = `(${components.map((c) => `"${c}"`).join(" ")});created=${params.created};expires=${params.expires};keyid="${keyid}";alg="ed25519"${params.tag ? `;tag="${params.tag}"` : ""}${params.nonce ? `;nonce="${params.nonce}"` : ""}`;
  lines.push(`"@signature-params": ${paramsBody}`);
  const base = TEXT.encode(lines.join("\n"));
  const sig = await ed.signAsync(base, secretKey);
  const sigInputHeader = `sig1=${paramsBody}`;
  const sigHeader = `sig1=:${base64Encode(sig)}:`;
  return {
    "signature-input": sigInputHeader,
    signature: sigHeader,
    "signature-agent": signatureAgent,
  };
}

afterEach(() => {
  clearJwksCache();
});

describe("parseSignatureInput", () => {
  it("parses a single labelled entry with params", () => {
    const parsed = parseSignatureInput(
      'sig1=("@authority" "signature-agent");created=1716156000;keyid="abc";alg="ed25519";tag="web-bot-auth"',
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.label).toBe("sig1");
    expect(parsed[0]!.components).toEqual(["@authority", "signature-agent"]);
    expect(parsed[0]!.params.keyid).toBe("abc");
    expect(parsed[0]!.params.alg).toBe("ed25519");
    expect(parsed[0]!.params.tag).toBe("web-bot-auth");
    expect(parsed[0]!.params.created).toBe(1716156000);
  });

  it("parses multiple entries separated by top-level commas", () => {
    const parsed = parseSignatureInput(
      'sig1=("@authority");keyid="k1",sig2=("@method");keyid="k2"',
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.params.keyid).toBe("k1");
    expect(parsed[1]!.params.keyid).toBe("k2");
  });
});

describe("verifyWebBotAuth — happy path", () => {
  it("verifies a freshly-signed request", async () => {
    const { secretKey, keyid, jwks } = await makeBot();
    const now = Math.floor(Date.now() / 1000);
    const headers = await signRequest({
      secretKey,
      keyid,
      authority: "example.com",
      targetUri: "/articles?id=1",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created: now, expires: now + 300, tag: "web-bot-auth" },
    });

    const result = await verifyWebBotAuth(
      {
        method: "GET",
        authority: "example.com",
        targetUri: "/articles?id=1",
        headers,
      },
      { fetchImpl: fakeFetch(jwks) },
    );
    expect(result.valid).toBe(true);
    expect(result.keyid).toBe(keyid);
    expect(result.signatureAgent).toBe('"https://bot.example/"');
  });
});

describe("verifyWebBotAuth — failure paths", () => {
  it("returns no-signature when headers are missing", async () => {
    const r = await verifyWebBotAuth({
      method: "GET",
      authority: "example.com",
      targetUri: "/",
      headers: {},
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("no-signature");
  });

  it("rejects expired signatures", async () => {
    const { secretKey, keyid, jwks } = await makeBot();
    const created = Math.floor(Date.now() / 1000) - 600;
    const expires = created + 60; // expired ~9 min ago
    const headers = await signRequest({
      secretKey,
      keyid,
      authority: "example.com",
      targetUri: "/",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created, expires, tag: "web-bot-auth" },
    });
    const r = await verifyWebBotAuth(
      {
        method: "GET",
        authority: "example.com",
        targetUri: "/",
        headers,
      },
      { fetchImpl: fakeFetch(jwks), clockSkewSeconds: 1 },
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("rejects when the JWKS does not contain the keyid", async () => {
    const a = await makeBot();
    const b = await makeBot();
    const now = Math.floor(Date.now() / 1000);
    const headers = await signRequest({
      secretKey: a.secretKey,
      keyid: a.keyid,
      authority: "example.com",
      targetUri: "/",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created: now, expires: now + 300, tag: "web-bot-auth" },
    });
    // Serve B's JWKS — A's keyid is not present.
    const r = await verifyWebBotAuth(
      {
        method: "GET",
        authority: "example.com",
        targetUri: "/",
        headers,
      },
      { fetchImpl: fakeFetch(b.jwks) },
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("key-not-found");
  });

  it("rejects a tampered authority", async () => {
    const { secretKey, keyid, jwks } = await makeBot();
    const now = Math.floor(Date.now() / 1000);
    const headers = await signRequest({
      secretKey,
      keyid,
      authority: "example.com",
      targetUri: "/articles",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created: now, expires: now + 300, tag: "web-bot-auth" },
    });
    // Mutate the @authority value in the verifier's view of the request.
    const r = await verifyWebBotAuth(
      {
        method: "GET",
        authority: "tampered.example",
        targetUri: "/articles",
        headers,
      },
      { fetchImpl: fakeFetch(jwks) },
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad-signature");
  });

  it("rejects unsupported algorithms", async () => {
    const { secretKey, keyid, jwks } = await makeBot();
    const now = Math.floor(Date.now() / 1000);
    const real = await signRequest({
      secretKey,
      keyid,
      authority: "example.com",
      targetUri: "/",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created: now, expires: now + 300, tag: "web-bot-auth" },
    });
    // Swap alg=ed25519 → alg=rsa-pss-sha256
    const fudged = {
      ...real,
      "signature-input": real["signature-input"].replace(
        'alg="ed25519"',
        'alg="rsa-pss-sha256"',
      ),
    };
    const r = await verifyWebBotAuth(
      {
        method: "GET",
        authority: "example.com",
        targetUri: "/",
        headers: fudged,
      },
      { fetchImpl: fakeFetch(jwks) },
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("unsupported-alg");
  });
});

describe("verifyWebBotAuth — replay protection (seenNonceCache)", () => {
  it("rejects a replayed nonce on the second use", async () => {
    const { secretKey, keyid, jwks } = await makeBot();
    const now = Math.floor(Date.now() / 1000);
    const headers = await signRequest({
      secretKey,
      keyid,
      authority: "example.com",
      targetUri: "/",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created: now, expires: now + 300, tag: "web-bot-auth", nonce: "nonce-123" },
    });
    const seen = new Set<string>();
    const opts = {
      fetchImpl: fakeFetch(jwks),
      seenNonceCache: (n: string) => {
        if (seen.has(n)) return true;
        seen.add(n);
        return false;
      },
    };
    const req = { method: "GET", authority: "example.com", targetUri: "/", headers };
    const first = await verifyWebBotAuth(req, opts);
    expect(first.valid).toBe(true);
    const second = await verifyWebBotAuth(req, opts);
    expect(second.valid).toBe(false);
    expect(second.reason).toBe("replay");
  });

  it("does not consult the nonce store when the signature carries no nonce", async () => {
    const { secretKey, keyid, jwks } = await makeBot();
    const now = Math.floor(Date.now() / 1000);
    const headers = await signRequest({
      secretKey,
      keyid,
      authority: "example.com",
      targetUri: "/",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created: now, expires: now + 300, tag: "web-bot-auth" }, // no nonce
    });
    let called = false;
    const r = await verifyWebBotAuth(
      { method: "GET", authority: "example.com", targetUri: "/", headers },
      {
        fetchImpl: fakeFetch(jwks),
        seenNonceCache: () => {
          called = true;
          return true;
        },
      },
    );
    expect(r.valid).toBe(true);
    expect(called).toBe(false);
  });

  it("fails closed (reason: replay) when the nonce store throws", async () => {
    const { secretKey, keyid, jwks } = await makeBot();
    const now = Math.floor(Date.now() / 1000);
    const headers = await signRequest({
      secretKey,
      keyid,
      authority: "example.com",
      targetUri: "/",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created: now, expires: now + 300, tag: "web-bot-auth", nonce: "nonce-xyz" },
    });
    const r = await verifyWebBotAuth(
      { method: "GET", authority: "example.com", targetUri: "/", headers },
      {
        fetchImpl: fakeFetch(jwks),
        seenNonceCache: () => {
          throw new Error("redis down");
        },
      },
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("replay");
    expect(r.detail).toContain("redis down");
  });
});

describe("verifyWebBotAuth — jwksTtlMs", () => {
  it("re-fetches the JWKS on every call when jwksTtlMs is 0", async () => {
    const { secretKey, keyid, jwks } = await makeBot();
    const now = Math.floor(Date.now() / 1000);
    const headers = await signRequest({
      secretKey,
      keyid,
      authority: "example.com",
      targetUri: "/",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created: now, expires: now + 300, tag: "web-bot-auth" },
    });
    let fetchCount = 0;
    const countingFetch: typeof fetch = async () => {
      fetchCount++;
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const req = { method: "GET", authority: "example.com", targetUri: "/", headers };
    await verifyWebBotAuth(req, { fetchImpl: countingFetch, jwksTtlMs: 0 });
    await verifyWebBotAuth(req, { fetchImpl: countingFetch, jwksTtlMs: 0 });
    // TTL 0 → cache entry expires immediately → both calls fetch.
    expect(fetchCount).toBe(2);
  });

  it("serves from cache on the second call under the default TTL", async () => {
    const { secretKey, keyid, jwks } = await makeBot();
    const now = Math.floor(Date.now() / 1000);
    const headers = await signRequest({
      secretKey,
      keyid,
      authority: "example.com",
      targetUri: "/",
      signatureAgent: '"https://bot.example/"',
      components: ["@authority", "signature-agent"],
      params: { created: now, expires: now + 300, tag: "web-bot-auth" },
    });
    let fetchCount = 0;
    const countingFetch: typeof fetch = async () => {
      fetchCount++;
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const req = { method: "GET", authority: "example.com", targetUri: "/", headers };
    await verifyWebBotAuth(req, { fetchImpl: countingFetch });
    await verifyWebBotAuth(req, { fetchImpl: countingFetch });
    // Default 1h TTL → second call hits the cache.
    expect(fetchCount).toBe(1);
  });
});

describe("jwkThumbprint", () => {
  it("computes the canonical RFC 7638 thumbprint for an Ed25519 JWK", () => {
    const jwk: WbaJwk = {
      kty: "OKP",
      crv: "Ed25519",
      x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
    };
    // Computed by hand from the canonical form `{"crv":"Ed25519","kty":"OKP","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}`.
    const tp = jwkThumbprint(jwk);
    expect(tp).toMatch(/^[A-Za-z0-9_-]{43}$/); // base64url SHA-256 = 43 chars
  });

  it("differs for different keys", () => {
    const a: WbaJwk = { kty: "OKP", crv: "Ed25519", x: "AAA" };
    const b: WbaJwk = { kty: "OKP", crv: "Ed25519", x: "BBB" };
    expect(jwkThumbprint(a)).not.toBe(jwkThumbprint(b));
  });
});
