import crypto from "node:crypto";

const stateTtlMs = 10 * 60 * 1000;

function base64UrlJson(value) {
  return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
}

function normalize(value) {
  return String(value ?? "").trim();
}

function formEncode(values) {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "")).toString();
}

export function createEntraAuthenticator(options = {}) {
  const tenantId = normalize(options.tenantId);
  const clientId = normalize(options.clientId);
  const clientSecret = normalize(options.clientSecret);
  const redirectUri = normalize(options.redirectUri);
  const authorityHost = normalize(options.authorityHost || "https://login.microsoftonline.com").replace(/\/$/, "");
  const transactions = new Map();
  let metadataPromise = null;
  let jwksPromise = null;

  const configured = () => Boolean(tenantId && clientId && clientSecret && redirectUri);
  const metadataUrl = () => `${authorityHost}/${encodeURIComponent(tenantId)}/v2.0/.well-known/openid-configuration`;

  async function metadata() {
    if (!configured()) throw new Error("Microsoft sign-in is not configured for this deployment.");
    if (!metadataPromise) {
      metadataPromise = fetch(metadataUrl()).then(async (response) => {
        if (!response.ok) throw new Error("Unable to load Microsoft sign-in metadata.");
        return response.json();
      });
    }
    return metadataPromise;
  }

  async function jwks(uri) {
    if (!jwksPromise) {
      jwksPromise = fetch(uri).then(async (response) => {
        if (!response.ok) throw new Error("Unable to load Microsoft signing keys.");
        return response.json();
      });
    }
    return jwksPromise;
  }

  function pruneTransactions() {
    const cutoff = Date.now() - stateTtlMs;
    for (const [state, transaction] of transactions.entries()) {
      if (!transaction || transaction.createdAt < cutoff) transactions.delete(state);
    }
  }

  async function start() {
    const document = await metadata();
    pruneTransactions();
    const state = crypto.randomBytes(32).toString("base64url");
    const nonce = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    transactions.set(state, { nonce, verifier, createdAt: Date.now() });
    const url = new URL(document.authorization_endpoint);
    url.search = formEncode({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256"
    });
    return url.toString();
  }

  async function verifyIdToken(idToken, nonce, document) {
    const parts = String(idToken || "").split(".");
    if (parts.length !== 3) throw new Error("Microsoft returned an invalid ID token.");
    const header = base64UrlJson(parts[0]);
    const claims = base64UrlJson(parts[1]);
    if (header.alg !== "RS256" || !normalize(header.kid)) throw new Error("Microsoft returned an unsupported ID token signature.");
    const keySet = await jwks(document.jwks_uri);
    const key = (keySet.keys || []).find((item) => item.kid === header.kid && Array.isArray(item.x5c) && item.x5c[0]);
    if (!key) throw new Error("Microsoft signing key was not found.");
    const certificate = new crypto.X509Certificate(Buffer.from(key.x5c[0], "base64"));
    const verified = crypto.verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), certificate.publicKey, Buffer.from(parts[2], "base64url"));
    if (!verified) throw new Error("Microsoft ID token signature verification failed.");
    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== clientId || claims.iss !== document.issuer || claims.tid !== tenantId || claims.nonce !== nonce || Number(claims.exp || 0) <= now || (claims.nbf && Number(claims.nbf) > now + 60)) {
      throw new Error("Microsoft ID token validation failed.");
    }
    if (!normalize(claims.oid || claims.sub)) throw new Error("Microsoft did not return a stable user identity.");
    return claims;
  }

  async function complete(url) {
    if (!configured()) throw new Error("Microsoft sign-in is not configured for this deployment.");
    const state = normalize(url.searchParams.get("state"));
    const code = normalize(url.searchParams.get("code"));
    const providerError = normalize(url.searchParams.get("error"));
    const transaction = transactions.get(state);
    transactions.delete(state);
    if (!transaction) throw new Error("Microsoft sign-in request expired or could not be verified. Try again.");
    if (providerError) throw new Error(`Microsoft sign-in failed: ${providerError}.`);
    if (!code) throw new Error("Microsoft did not return an authorization code.");
    const document = await metadata();
    const response = await fetch(document.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formEncode({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: transaction.verifier })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.id_token) throw new Error(payload.error_description || "Microsoft sign-in token exchange failed.");
    const claims = await verifyIdToken(payload.id_token, transaction.nonce, document);
    return {
      provider: "entra",
      issuer: claims.iss,
      tenantId: claims.tid,
      subject: normalize(claims.oid || claims.sub),
      email: normalize(claims.email || claims.preferred_username),
      displayName: normalize(claims.name || claims.preferred_username || claims.email)
    };
  }

  return { configured, start, complete };
}