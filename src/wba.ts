/**
 * @crawlertoll/core/wba — Web Bot Auth verification sub-export.
 *
 *   import { verifyWebBotAuth } from "@crawlertoll/core/wba";
 *
 * Implements `draft-meunier-web-bot-auth-architecture-05` for incoming
 * HTTP requests signed with Ed25519 keys served from
 * `/.well-known/http-message-signatures-directory`.
 */

export {
  verifyWebBotAuth,
  clearJwksCache,
} from "./wba/verify.js";

export {
  parseSignatureInput,
  parseSignature,
} from "./wba/structured.js";

export {
  jwkThumbprint,
  jwkToRawPublicKey,
  findJwkByKeyid,
  directoryUrl,
  base64urlEncode,
  base64urlDecode,
} from "./wba/jwks.js";

export type {
  VerifyInput,
  VerifyOptions,
  WbaVerifyResult,
  WbaAlgorithm,
  WbaJwk,
  WbaJwks,
  WbaSignatureParams,
  ParsedSignatureInput,
} from "./wba/types.js";
