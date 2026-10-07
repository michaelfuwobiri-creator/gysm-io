// Visual edit (Gap 6): click an element in the builder preview, change its
// text or colours, and save the change into the build's HTML without an AI
// call. Edits are applied to the SOURCE HTML, not to the running page's DOM,
// because a running app may have rewritten its own DOM with JavaScript;
// serialising that back would bake script output into the saved file.
//
// The preview iframe has an opaque origin, so the parent cannot reach into it.
// A small bridge script injected into the preview (never saved) reports what
// was clicked via postMessage; this module locates the same element in the
// source and patches it.

export type VisualEdit = {
  /** `body > div:nth-of-type(2) > h1:nth-of-type(1)` style path, from <body>. */
  path: string;
  tag: string;
  /** Whitespace-normalised text of the element (first 200 chars), to confirm we found the same one. */
  expect: string;
  setText?: string;
  /** #rrggbb, or null to remove an earlier override. undefined = leave alone. */
  color?: string | null;
  background?: string | null;
};

export type VisualEditResult = { ok: true; html: string } | { ok: false; error: string };

const SAFE_PATH = /^body(?: > [a-z][a-z0-9]*:nth-of-type\(\d{1,3}\)){0,40}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const NO_TEXT_EDIT = new Set(["script", "style", "noscript", "template", "textarea", "title", "svg", "path"]);
const STYLE_ID = "gysm-visual-edits";
export const MAX_EDIT_TEXT = 2000;

export function isHexColor(s: unknown): s is string {
  return typeof s === "string" && HEX.test(s);
}

export function isSafePath(s: unknown): s is string {
  return typeof s === "string" && SAFE_PATH.test(s);
}

export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 200);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Rules = Map<string, { color?: string; background?: string }>;

function readRules(html: string): { rules: Rules; match: RegExpMatchArray | null } {
  const match = html.match(new RegExp(`<style id="${STYLE_ID}">([\\s\\S]*?)</style>\\n?`));
  const rules: Rules = new Map();
  if (match) {
    for (const chunk of match[1].split("}")) {
      const brace = chunk.indexOf("{");
      if (brace < 0) continue;
      const path = chunk.slice(0, brace).trim();
      if (!isSafePath(path)) continue;
      const rule: { color?: string; background?: string } = {};
      for (const decl of chunk.slice(brace + 1).split(";")) {
        const m = decl.trim().match(/^(color|background-color):(#[0-9a-fA-F]{6}) !important$/);
        if (m) rule[m[1] === "color" ? "color" : "background"] = m[2];
      }
      rules.set(path, rule);
    }
  }
  return { rules, match };
}

function writeRules(html: string, rules: Rules, existing: RegExpMatchArray | null): string {
  const lines: string[] = [];
  for (const [path, r] of Array.from(rules)) {
    const decls: string[] = [];
    if (r.color) decls.push(`color:${r.color} !important`);
    if (r.background) decls.push(`background-color:${r.background} !important`);
    if (decls.length) lines.push(`${path}{${decls.join(";")}}`);
  }
  const block = lines.length ? `<style id="${STYLE_ID}">${lines.join("\n")}</style>` : "";
  if (existing) return html.replace(existing[0], () => (block ? block + "\n" : ""));
  if (!block) return html;
  const head = html.match(/<\/head>/i);
  if (head && head.index !== undefined) return html.slice(0, head.index) + block + "\n" + html.slice(head.index);
  return html.replace(/<body[^>]*>/i, (m) => `${m}${block}`) || block + html;
}

/**
 * Applies one visual edit to the source HTML. `parse` turns HTML into a DOM
 * (the browser's DOMParser; tests pass a stand-in).
 */
export function applyVisualEdit(html: string, edit: VisualEdit, parse: (html: string) => Document): VisualEditResult {
  if (!isSafePath(edit.path)) return { ok: false, error: "That element can't be edited." };
  if (typeof edit.tag !== "string" || !/^[a-z][a-z0-9]*$/.test(edit.tag)) return { ok: false, error: "That element can't be edited." };
  if (edit.color != null && !isHexColor(edit.color)) return { ok: false, error: "Not a valid colour." };
  if (edit.background != null && !isHexColor(edit.background)) return { ok: false, error: "Not a valid colour." };
  if (edit.setText !== undefined && (typeof edit.setText !== "string" || edit.setText.length > MAX_EDIT_TEXT)) {
    return { ok: false, error: "That text is too long." };
  }

  const doc = parse(html);
  const el = doc.querySelector(edit.path);
  const notFound =
    "Couldn't find that element in the saved page, so it was probably created by the page's own script. Ask the AI to change it instead.";
  if (!el || el.tagName.toLowerCase() !== edit.tag) return { ok: false, error: notFound };
  if (normalizeText(el.textContent || "") !== edit.expect) return { ok: false, error: notFound };

  let out = html;

  if (edit.setText !== undefined) {
    if (NO_TEXT_EDIT.has(edit.tag)) return { ok: false, error: "That element's text can't be edited here." };
    if (el.children.length > 0) return { ok: false, error: "Select the smallest piece of text you want to change." };
    const inner = el.innerHTML;
    const same = Array.from(doc.querySelectorAll(edit.tag)).filter((n) => n.children.length === 0 && n.innerHTML === inner);
    const k = same.indexOf(el);
    const re = new RegExp(`(<${edit.tag}(?:\\s[^>]*)?>)${escapeRegExp(inner)}(</${edit.tag}>)`, "gi");
    const matches = Array.from(out.matchAll(re));
    if (k < 0 || matches.length !== same.length) {
      return { ok: false, error: "Couldn't safely locate that text in the page source. Ask the AI to change it instead." };
    }
    const m = matches[k];
    const start = (m.index ?? 0) + m[1].length;
    out = out.slice(0, start) + escapeHtml(edit.setText) + out.slice(start + inner.length);
  }

  if (edit.color !== undefined || edit.background !== undefined) {
    const { rules, match } = readRules(out);
    const rule = { ...(rules.get(edit.path) ?? {}) };
    if (edit.color !== undefined) {
      if (edit.color) rule.color = edit.color;
      else delete rule.color;
    }
    if (edit.background !== undefined) {
      if (edit.background) rule.background = edit.background;
      else delete rule.background;
    }
    rules.set(edit.path, rule);
    out = writeRules(out, rules, match);
  }

  return { ok: true, html: out };
}

// ---- Preview bridge ------------------------------------------------------
// Injected into the builder preview only (never saved). Inert until the
// parent sends {gysm:"edit", on:true}. It never serialises the page; it only
// reports which element was clicked.

export const VISUAL_EDIT_BRIDGE =
  "<script>(function(){var on=false,sel=null,hov=null;" +
  "var st=document.createElement('style');st.textContent='[data-gysm-hover]{outline:2px dashed #FF0080!important;cursor:pointer!important}[data-gysm-sel]{outline:2px solid #FF0080!important;outline-offset:2px}';(document.head||document.documentElement).appendChild(st);" +
  "function path(el){var p=[];while(el&&el.nodeType===1&&el!==document.body){var t=el.tagName.toLowerCase(),i=1,s=el;while((s=s.previousElementSibling)){if(s.tagName===el.tagName)i++}p.unshift(t+':nth-of-type('+i+')');el=el.parentElement}return 'body'+(p.length?' > '+p.join(' > '):'')}" +
  "function hex(c){var m=c&&c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/);if(!m||(m[4]!==undefined&&parseFloat(m[4])===0))return null;return '#'+[1,2,3].map(function(i){return ('0'+parseInt(m[i],10).toString(16)).slice(-2)}).join('')}" +
  "function norm(s){return String(s||'').replace(/\\s+/g,' ').trim().slice(0,200)}" +
  "function clear(a){var n=document.querySelectorAll('['+a+']');for(var i=0;i<n.length;i++)n[i].removeAttribute(a)}" +
  "document.addEventListener('mouseover',function(e){if(!on)return;if(hov)hov.removeAttribute('data-gysm-hover');hov=e.target;if(hov&&hov.setAttribute)hov.setAttribute('data-gysm-hover','')},true);" +
  "document.addEventListener('click',function(e){if(!on)return;e.preventDefault();e.stopPropagation();var el=e.target;if(!el||el.nodeType!==1)return;clear('data-gysm-sel');el.setAttribute('data-gysm-sel','');sel=el;var cs=getComputedStyle(el);" +
  "parent.postMessage({gysm:'select',path:path(el),tag:el.tagName.toLowerCase(),expect:norm(el.textContent),leaf:el.children.length===0,text:el.children.length===0?el.textContent:'',color:hex(cs.color),background:hex(cs.backgroundColor)},'*')},true);" +
  "document.addEventListener('submit',function(e){if(on)e.preventDefault()},true);" +
  "window.addEventListener('message',function(e){if(e.source!==parent)return;var d=e.data||{};" +
  "if(d.gysm==='edit'){on=!!d.on;if(!on){clear('data-gysm-hover');clear('data-gysm-sel');sel=null}}" +
  "if(d.gysm==='preview'&&sel){if(typeof d.text==='string'&&sel.children.length===0)sel.textContent=d.text;if(d.color)sel.style.color=d.color;if(d.background)sel.style.backgroundColor=d.background}});" +
  "})();</script>";

/** Adds the bridge right after <head> (or at the start) of preview HTML. */
export function withVisualEditBridge(html: string): string {
  if (!html) return html;
  const m = html.match(/<head[^>]*>/i);
  if (m && m.index !== undefined) {
    const at = m.index + m[0].length;
    return html.slice(0, at) + VISUAL_EDIT_BRIDGE + html.slice(at);
  }
  return VISUAL_EDIT_BRIDGE + html;
}
