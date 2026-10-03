// ---------------------------------------------------------------------------
// Untrusted-URL validation for href/src sinks.
//
// React escapes text, but attributes that become navigation targets
// (href, iframe src) are live URLs: `javascript:`, `data:` and
// protocol-relative `//evil.com` all survive escaping. Every URL that comes
// from an API response, an AI answer, or a user profile must pass through
// safeWebHref() before it reaches the DOM.
// ---------------------------------------------------------------------------

/** Returns the URL only when it is a safe web target (http/https absolute,
 * site-relative path, or in-page fragment); otherwise null. */
export function safeWebHref(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  // Control characters are how `java\tscript:` style smuggling happens.
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;
  if (value.startsWith('/')) {
    // Site-relative is fine; protocol-relative (`//host`) is not.
    return value.startsWith('//') ? null : value;
  }
  if (value.startsWith('#') || value.startsWith('?')) return value;
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
  } catch {
    return null; // relative paths without a leading slash, junk, etc.
  }
  return null;
}

/** safeWebHref() + the host must be one of the allowed origins — for
 * embeds where a whole player, not just a link, is being handed to a
 * third party (e.g. YouTube iframes). */
export function safeEmbedSrc(raw: string | null | undefined, allowedHostSuffixes: string[]): string | null {
  const href = safeWebHref(raw);
  if (!href) return null;
  let host: string;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
  const ok = allowedHostSuffixes.some(
    (suffix) => host === suffix.toLowerCase() || host.endsWith(`.${suffix.toLowerCase()}`),
  );
  return ok ? href : null;
}
