// GYSM page tools. Injected into the page in the user's tab by the side panel
// (chrome.scripting.executeScript). Runs in the extension's isolated world, so
// the page's own scripts cannot see or replace it. Everything here is plain
// DOM; nothing is sent anywhere. The side panel decides what to do with the
// results.
(() => {
  if (globalThis.__gysmTools && globalThis.__gysmTools.v === 2) return;

  const MAX_ELEMENTS = 150;
  const MAX_TEXT = 22000;
  const ATTR = "data-gysm-id";
  // Buying, paying, sending, posting, deleting and signing out always need a person.
  const RISKY_LABEL = /\b(delete|remove|erase|pay|buy|purchase|order|checkout|check out|place order|confirm|send|post|publish|submit|transfer|withdraw|donate|subscribe|unsubscribe|cancel|sign ?out|log ?out|deactivate|close account|reset|revoke|disconnect|authorize|allow|grant|accept|agree)\b/i;

  const INTERACTIVE =
    'a[href],button,input:not([type="hidden"]),textarea,select,summary,[contenteditable=""],[contenteditable="true"],' +
    '[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],' +
    '[role="option"],[role="combobox"],[role="textbox"],[onclick],[tabindex]:not([tabindex="-1"])';

  const clip = (s, n) => {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  };

  function visible(el) {
    if (!(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
    if (el.closest("[aria-hidden='true'],[inert]")) return false;
    return true;
  }

  /** Fields the agent must never fill: passwords, card data, one-time codes. */
  function isSecretField(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea") return false;
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "password") return true;
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (/(^|\s)(cc-|one-time-code|current-password|new-password)/.test(ac)) return true;
    const hint = [el.name, el.id, el.getAttribute("aria-label"), el.placeholder].join(" ").toLowerCase();
    return /(card.?(number|no)|cvv|cvc|security.?code|passcode|one.?time|otp|\bpin\b|ssn|social.?security)/.test(hint);
  }

  function looksLikeCardNumber(text) {
    const digits = String(text).replace(/[\s-]/g, "");
    if (!/^\d{13,19}$/.test(digits)) return false;
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits.charCodeAt(i) - 48;
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function labelOf(el) {
    const aria = el.getAttribute("aria-label");
    if (aria) return clip(aria, 80);
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
      if (t.trim()) return clip(t, 80);
    }
    if (el.labels && el.labels.length) return clip(Array.from(el.labels).map((l) => l.textContent).join(" "), 80);
    const tag = el.tagName.toLowerCase();
    if (tag === "input" && /^(button|submit|reset)$/i.test(el.type)) return clip(el.value, 80);
    const text = clip(el.innerText || el.textContent, 80);
    if (text) return text;
    return clip(el.getAttribute("title") || el.getAttribute("alt") || el.placeholder || el.name || el.querySelector?.("img[alt]")?.getAttribute("alt") || "", 80);
  }

  function kindOf(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (tag === "a" || role === "link") return "link";
    if (tag === "button" || tag === "summary" || role === "button" || role === "tab" || role === "menuitem") return "button";
    if (tag === "select" || role === "combobox") return "select";
    if (tag === "textarea" || role === "textbox" || el.isContentEditable) return "textbox";
    if (tag === "input") {
      const t = (el.type || "text").toLowerCase();
      if (t === "checkbox" || t === "radio") return t;
      if (/^(button|submit|reset|image)$/.test(t)) return "button";
      return "input " + t;
    }
    if (role === "checkbox" || role === "radio" || role === "switch") return role;
    return "clickable";
  }

  function collect() {
    const found = [];
    const seen = new Set();
    const add = (el) => {
      if (seen.has(el) || !visible(el)) return;
      seen.add(el);
      found.push(el);
    };
    document.querySelectorAll(INTERACTIVE).forEach(add);
    // Drop wrappers that only contain other listed elements (a div[onclick] around a link).
    return found.filter((el) => !/^(div|span|li|section)$/i.test(el.tagName) || !found.some((o) => o !== el && el.contains(o))).slice(0, MAX_ELEMENTS);
  }

  function describeEl(el) {
    const kind = kindOf(el);
    let line = `${kind} "${labelOf(el)}"`;
    if (el.tagName === "A" && el.href) line += ` → ${clip(el.href, 120)}`;
    if (/^input|textbox|select/.test(kind)) {
      if (isSecretField(el)) line += " (secret field: do not use)";
      else if (el.tagName === "SELECT") line += ` value="${clip(el.selectedOptions?.[0]?.textContent || "", 40)}" options=[${Array.from(el.options).slice(0, 12).map((o) => clip(o.textContent, 30)).join(" | ")}]`;
      else {
        const v = el.isContentEditable ? el.innerText : el.value;
        if (v) line += ` value="${clip(v, 60)}"`;
      }
    }
    if (el.type === "checkbox" || el.type === "radio") line += el.checked ? " (checked)" : " (unchecked)";
    if (el.getAttribute("aria-expanded")) line += ` (expanded=${el.getAttribute("aria-expanded")})`;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") line += " (disabled)";
    return line;
  }

  /**
   * The text a person can actually see. Skips display:none, visibility:hidden,
   * fully transparent, zero-size-font and off-screen text, which is where pages
   * hide instructions aimed at AI agents.
   */
  function visibleText() {
    const body = document.body;
    if (!body) return "";
    const okCache = new Map();
    const blockCache = new Map();
    const SKIP = /^(script|style|noscript|template|head|svg)$/i;
    const okEl = (el) => {
      if (!el || el === document.documentElement) return true;
      if (okCache.has(el)) return okCache.get(el);
      let ok = !SKIP.test(el.tagName);
      if (ok) {
        const cs = getComputedStyle(el);
        ok = cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05 && parseFloat(cs.fontSize) >= 5;
        if (ok) {
          const r = el.getBoundingClientRect();
          if ((r.right + scrollX < 0 || r.bottom + scrollY < 0) && r.width > 0) ok = false;
        }
        if (ok) ok = okEl(el.parentElement);
      }
      okCache.set(el, ok);
      return ok;
    };
    const blockOf = (el) => {
      let n = el;
      while (n && n !== body) {
        if (blockCache.has(n)) return blockCache.get(n);
        const d = getComputedStyle(n).display;
        if (!/^inline/.test(d) && d !== "contents") {
          blockCache.set(n, n);
          return n;
        }
        n = n.parentElement;
      }
      return body;
    };
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const out = [];
    let len = 0;
    let lastBlock = null;
    let node;
    while ((node = walker.nextNode())) {
      const t = node.nodeValue.replace(/\s+/g, " ");
      if (!t.trim()) continue;
      const parent = node.parentElement;
      if (!okEl(parent)) continue;
      const b = blockOf(parent);
      if (lastBlock && b !== lastBlock) out.push("\n");
      lastBlock = b;
      out.push(t);
      len += t.length;
      if (len > MAX_TEXT * 2) break;
    }
    return out.join("").replace(/ *\n */g, "\n");
  }

  function read() {
    document.querySelectorAll(`[${ATTR}]`).forEach((n) => n.removeAttribute(ATTR));
    const els = collect();
    els.forEach((el, i) => el.setAttribute(ATTR, String(i + 1)));
    let text = visibleText();
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    const truncated = text.length > MAX_TEXT;
    if (truncated) text = text.slice(0, MAX_TEXT) + "\n[page text cut]";
    const doc = document.documentElement;
    const maxScroll = Math.max(1, doc.scrollHeight - innerHeight);
    const pct = Math.round((scrollY / maxScroll) * 100);
    const lines = [
      `URL: ${location.href}`,
      `Title: ${document.title}`,
      `Scroll: ${pct}% of the page (viewport ${innerHeight}px of ${doc.scrollHeight}px)`,
      "",
      "PAGE TEXT:",
      text || "(no visible text)",
      "",
      `ELEMENTS (${els.length}${els.length >= MAX_ELEMENTS ? ", more not shown" : ""}):`,
      ...els.map((el, i) => `[${i + 1}] ${describeEl(el)}`),
    ];
    if (document.querySelector("iframe")) lines.push("", "Note: content inside iframes is not included.");
    return { ok: true, output: lines.join("\n") };
  }

  function find(id) {
    const n = Number(id);
    const el = Number.isInteger(n) ? document.querySelector(`[${ATTR}="${n}"]`) : null;
    if (!el || !el.isConnected) return null;
    return el;
  }
  const STALE = { ok: false, output: "That element is no longer on the page. Call browser_read again and use the new numbers." };

  function describe(id) {
    const el = find(id);
    if (!el) return STALE;
    const label = labelOf(el);
    const inForm = el.closest ? el.closest("form") : null;
    return {
      ok: true,
      output: describeEl(el),
      label,
      kind: kindOf(el),
      secret: isSecretField(el),
      host: location.host,
      // Things the extension never does on its own, even in autonomous mode.
      risky: RISKY_LABEL.test(label) || (el.type === "submit" && !!inForm && !!inForm.querySelector('input[type="password"],[autocomplete^="cc-"]')),
      search: (el.type || "").toLowerCase() === "search" || !!(el.closest && el.closest('[role="search"]')) || /search/i.test(label),
    };
  }

  function click(id) {
    const el = find(id);
    if (!el) return STALE;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return { ok: false, output: "That element is disabled." };
    el.scrollIntoView({ block: "center", inline: "center" });
    const label = labelOf(el);
    el.focus?.({ preventScroll: true });
    // A real click sequence, for pages that listen for pointer events.
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    el.click();
    return { ok: true, output: `Clicked ${kindOf(el)} "${label}". The page may have changed: call browser_read to see it.` };
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function type(id, text, submit) {
    const el = find(id);
    if (!el) return STALE;
    text = String(text == null ? "" : text);
    if (isSecretField(el)) return { ok: false, output: "Refused: that is a password, card or code field. Ask the user to fill it in themselves." };
    if (looksLikeCardNumber(text)) return { ok: false, output: "Refused: that looks like a card number. Ask the user to enter it themselves." };
    if (el.disabled || el.readOnly) return { ok: false, output: "That field can't be edited." };
    el.scrollIntoView({ block: "center" });
    el.focus?.({ preventScroll: true });
    const tag = el.tagName.toLowerCase();
    if (tag === "select") {
      const want = text.trim().toLowerCase();
      const opt = Array.from(el.options).find((o) => o.value.toLowerCase() === want || o.textContent.trim().toLowerCase() === want) || Array.from(el.options).find((o) => o.textContent.toLowerCase().includes(want));
      if (!opt) return { ok: false, output: `No option matches "${clip(text, 40)}". Options: ${Array.from(el.options).slice(0, 12).map((o) => clip(o.textContent, 30)).join(" | ")}` };
      setNativeValue(el, opt.value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, output: `Selected "${clip(opt.textContent, 60)}".` };
    }
    if (el.isContentEditable) {
      const sel = getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
    } else if (tag === "input" || tag === "textarea") {
      const t = (el.type || "text").toLowerCase();
      if (/^(checkbox|radio|button|submit|reset|file|image|range|color)$/.test(t)) return { ok: false, output: `Can't type into a ${t} input.` };
      setNativeValue(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      return { ok: false, output: "That element isn't a text field." };
    }
    let extra = "";
    if (submit) {
      for (const type of ["keydown", "keypress", "keyup"]) {
        el.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      }
      const form = el.form;
      if (form && tag === "input" && typeof form.requestSubmit === "function") {
        // Many forms submit on Enter by default; requestSubmit covers the ones the key events missed.
        try {
          form.requestSubmit();
        } catch {
          /* validation blocked it */
        }
      }
      extra = " and pressed Enter";
    }
    return { ok: true, output: `Typed ${text.length} characters${extra}. Call browser_read to check the result.` };
  }

  function scroll(direction) {
    const dir = direction === "up" ? -1 : 1;
    const before = scrollY;
    scrollBy({ top: dir * Math.round(innerHeight * 0.8), left: 0, behavior: "instant" });
    const doc = document.documentElement;
    const atEnd = scrollY + innerHeight >= doc.scrollHeight - 2;
    const atTop = scrollY <= 0;
    return {
      ok: true,
      output: `Scrolled ${dir > 0 ? "down" : "up"} ${Math.round(Math.abs(scrollY - before))}px${dir > 0 && atEnd ? " (reached the bottom)" : ""}${dir < 0 && atTop ? " (reached the top)" : ""}. Call browser_read to see this part.`,
    };
  }

  globalThis.__gysmTools = { v: 2, read, describe, click, type, scroll, isSecretField, looksLikeCardNumber };
})();
