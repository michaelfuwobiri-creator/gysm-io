// Where user-built apps are served from.
//
// Generated apps are arbitrary JavaScript. Run on the www.gysm.io origin they
// could call GYSM's own authenticated APIs as the viewer. When
// USER_CONTENT_ORIGIN is set (a different registrable site, for example an
// extra *.vercel.app alias of this same deployment), apps are loaded from
// there instead, so the browser's same-origin policy keeps them away from the
// app's cookies and APIs.

export function userContentOrigin(): string | null {
  const raw = process.env.USER_CONTENT_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Is this request host the isolated user-content host? */
export function isUserContentHost(host: string | null | undefined): boolean {
  const origin = userContentOrigin();
  if (!origin || !host) return false;
  return new URL(origin).host.toLowerCase() === host.toLowerCase();
}

/** URL an iframe should load for a project's entry page, or null to use srcDoc. */
export function appFrameUrl(projectId: string, path = ""): string | null {
  const origin = userContentOrigin();
  return origin ? `${origin}/a/${projectId}/${path}` : null;
}

/**
 * Injected at the top of builder-preview srcDoc content. The preview iframe
 * has an opaque origin (no allow-same-origin), where localStorage and
 * sessionStorage throw. Apps are written to use them, so give the preview
 * in-memory stand-ins instead. State then lasts for the session, not across
 * reloads, which is fine for a preview.
 */
export const PREVIEW_STORAGE_SHIM =
  "<script>(function(){function m(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}" +
  "['localStorage','sessionStorage'].forEach(function(n){try{void window[n]}catch(e){try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(_){}}})})();</script>";

export function withPreviewShim(html: string): string {
  if (!html) return html;
  const m = html.match(/<head[^>]*>/i);
  if (m && m.index !== undefined) {
    const at = m.index + m[0].length;
    return html.slice(0, at) + PREVIEW_STORAGE_SHIM + html.slice(at);
  }
  return PREVIEW_STORAGE_SHIM + html;
}
