type TokenOptions = {
  clientEmail: string;
  privateKey: string;
  scope: string | string[];
  tokenUri?: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

const tokenCache = new Map<string, CachedToken>();

function encodeBase64Url(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : new Uint8Array(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodePrivateKey(privateKey: string): ArrayBuffer {
  const base64 = privateKey
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function getServiceAccountAccessToken({
  clientEmail,
  privateKey,
  scope,
  tokenUri = "https://oauth2.googleapis.com/token",
}: TokenOptions): Promise<string> {
  const scopes = Array.isArray(scope) ? scope : [scope];
  const cacheKey = `${clientEmail}:${scopes.join(" ")}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: clientEmail,
    scope: scopes.join(" "),
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    decodePrivateKey(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken),
  );
  const assertion = `${unsignedToken}.${encodeBase64Url(signature)}`;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json() as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || `Google OAuth failed (${response.status})`);
  }

  tokenCache.set(cacheKey, {
    accessToken: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
  });
  return result.access_token;
}
