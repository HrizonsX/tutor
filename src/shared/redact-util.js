// @ts-nocheck
// Shared URL redaction helpers. Two deliberately different shapes:
// redactUrlForLog keeps the full URL (origin + path) for provider/network
// logs, while redactUrlPathForLog returns only path + query for surfaces
// that must never carry the endpoint host (gateway request logs, provider
// role diagnostics). Both scrub secret-bearing query parameters; the full
// variant also wipes userinfo credentials.

const SECRET_PARAM_PATTERN = /token|secret|key|authorization/i;
const SECRET_FALLBACK_PATTERN = /([?&][^=]*(?:token|secret|key|authorization)[^=]*=)[^&]*/gi;

export function redactUrlForLog(value = "") {
  try {
    const parsed = new URL(String(value));
    parsed.username = "";
    parsed.password = "";
    redactSecretParams(parsed);
    return parsed.toString().replaceAll("%3Credacted%3E", "<redacted>");
  } catch {
    return String(value).replace(SECRET_FALLBACK_PATTERN, "$1<redacted>");
  }
}

export function redactUrlPathForLog(value = "") {
  try {
    const parsed = new URL(String(value));
    redactSecretParams(parsed);
    return `${parsed.pathname}${parsed.search}`.replaceAll("%3Credacted%3E", "<redacted>");
  } catch {
    return String(value).replace(SECRET_FALLBACK_PATTERN, "$1<redacted>");
  }
}

function redactSecretParams(parsed) {
  for (const key of parsed.searchParams.keys()) {
    if (SECRET_PARAM_PATTERN.test(key)) {
      parsed.searchParams.set(key, "<redacted>");
    }
  }
}
