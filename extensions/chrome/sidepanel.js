// GYSM Agent side panel. Talks to https://www.gysm.io/api/agent with the
// user's own gysm.io sign-in (cookies), runs the browser_* tools the agent asks
// for against the active tab, and asks the user before every click, entry and
// page change. Page text is treated as data: it is only ever sent back to the
// agent as a tool result and never run or shown as HTML.
(() => {
  "use strict";

  const API = "https://www.gysm.io";
  const STORE_KEY = "gysm-chat-v1";
  const $ = (id) => document.getElementById(id);
  const log = $("log");

  let history = []; // OpenAI-format messages kept by the server's `state` events
  let transcript = []; // what the panel shows again after it is reopened
  let busy = false;
  let stopped = false;
  let abort = null;
  let shot = null; // { name, mime, data } waiting to be sent
  let lastBody = null;
  let approvalResolve = null;

  // ---------- small DOM helpers ----------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }
  function add(node) {
    $("empty").hidden = true;
    log.appendChild(node);
    scrollDown();
    return node;
  }

  // ---------- tiny, safe markdown (text nodes only) ----------
  function inline(parent, src) {
    const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
      if (m.index > last) parent.appendChild(document.createTextNode(src.slice(last, m.index)));
      const t = m[0];
      if (t[0] === "`") parent.appendChild(el("code", "", t.slice(1, -1)));
      else if (t[0] === "*") parent.appendChild(el("strong", "", t.slice(2, -2)));
      else {
        const mm = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(t);
        const a = el("a", "", mm[1]);
        a.href = mm[2];
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        parent.appendChild(a);
      }
      last = m.index + t.length;
    }
    if (last < src.length) parent.appendChild(document.createTextNode(src.slice(last)));
  }
  function renderMarkdown(container, src) {
    const lines = String(src).replace(/\r/g, "").split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++;
        const pre = el("pre");
        pre.appendChild(el("code", "", code.join("\n")));
        container.appendChild(pre);
      } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const list = el(ordered ? "ol" : "ul");
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          const li = el("li");
          inline(li, lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
          list.appendChild(li);
          i++;
        }
        container.appendChild(list);
      } else if (!line.trim()) {
        i++;
      } else {
        const p = el("p");
        const buf = [];
        while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) buf.push(lines[i++].replace(/^#{1,6}\s+/, ""));
        inline(p, buf.join("\n"));
        container.appendChild(p);
      }
    }
  }

  // ---------- transcript + persistence ----------
  function remember(entry) {
    transcript.push(entry);
    if (transcript.length > 80) transcript = transcript.slice(-80);
    save();
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const data = { history, transcript };
        if (JSON.stringify(data).length > 3_000_000) data.history = [];
        chrome.storage.local.set({ [STORE_KEY]: data }).catch(() => {});
      } catch {
        /* storage unavailable */
      }
    }, 200);
  }
  function userBubble(text) {
    add(el("div", "msg user", text));
  }
  function aiBubble(text) {
    const d = el("div", "msg ai");
    renderMarkdown(d, text);
    add(d);
  }
  function note(text, tone) {
    add(el("div", "note" + (tone === "error" ? " error" : ""), text));
  }
  async function restore() {
    try {
      const got = await chrome.storage.local.get(STORE_KEY);
      const d = got && got[STORE_KEY];
      if (d && Array.isArray(d.transcript)) {
        history = Array.isArray(d.history) ? d.history : [];
        transcript = d.transcript;
        for (const t of transcript) {
          if (t.k === "user") userBubble(t.text);
          else if (t.k === "ai") aiBubble(t.text);
          else note(t.text, t.tone);
        }
      }
    } catch {
      /* start fresh */
    }
  }

  // ---------- banner / approvals ----------
  function showBanner(build) {
    const b = $("banner");
    b.textContent = "";
    build(b);
    b.hidden = false;
  }
  function hideBanner() {
    $("banner").hidden = true;
  }
  function button(label, cls, onClick) {
    const b = el("button", cls || "", label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  /** Shows a card with Approve / Decline; resolves true or false. Stop resolves false. */
  function ask(what, where, detail, yes = "Approve", no = "Decline") {
    return new Promise((resolve) => {
      const card = el("div", "card");
      card.appendChild(el("div", "what", what));
      if (where) card.appendChild(el("div", "where", where));
      if (detail) card.appendChild(el("pre", "", detail));
      const btns = el("div", "btns");
      const finish = (ok) => {
        approvalResolve = null;
        card.classList.add("done");
        btns.remove();
        card.appendChild(el("div", "where", ok ? "Approved" : "Declined"));
        resolve(ok);
      };
      btns.appendChild(button(yes, "go", () => finish(true)));
      btns.appendChild(button(no, "", () => finish(false)));
      card.appendChild(btns);
      approvalResolve = finish;
      add(card);
      btns.firstChild.focus();
    });
  }

  // ---------- tabs and page access ----------
  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }
  function isWebUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }
  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  }
  async function refreshChip() {
    const chip = $("tab-chip");
    try {
      const t = await activeTab();
      chip.textContent = t && isWebUrl(t.url || "") ? `Working on: ${hostOf(t.url)} — ${t.title || ""}` : "Open a web page in this tab to use it with GYSM.";
    } catch {
      chip.textContent = "";
    }
  }

  /** Runs one of the page tools in the tab. Returns { ok, output, ... } or { needPermission }. */
  async function pageCall(tab, fn, args) {
    if (!tab || !isWebUrl(tab.url || "")) {
      return { ok: false, output: "I can't use this kind of page (browser pages, the Chrome Web Store and blank tabs are off limits). Ask the user to open a normal website." };
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["pagetools.js"] });
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (name, a) => globalThis.__gysmTools[name](...a),
        args: [fn, args || []],
      });
      const r = res && res[0] && res[0].result;
      return r || { ok: false, output: "The page didn't answer. Try again." };
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/permission|cannot access|host/i.test(msg)) return { ok: false, needPermission: true, host: hostOf(tab.url), output: `GYSM doesn't have permission to use ${hostOf(tab.url)} yet.` };
      return { ok: false, output: `Couldn't use the page: ${msg.slice(0, 200)}` };
    }
  }

  async function withPermission(tab, fn, args) {
    let r = await pageCall(tab, fn, args);
    if (!r.needPermission) return r;
    const origin = new URL(tab.url).origin + "/*";
    const choice = await new Promise((resolve) => {
      const card = el("div", "card");
      card.appendChild(el("div", "what", `Let GYSM use ${r.host}?`));
      card.appendChild(el("div", "where", "Chrome needs your OK before an extension can read or act on a site."));
      const btns = el("div", "btns");
      const done = (v) => {
        approvalResolve = null;
        card.classList.add("done");
        btns.remove();
        resolve(v);
      };
      btns.appendChild(button("This site", "go", () => done("site")));
      btns.appendChild(button("All sites", "", () => done("all")));
      btns.appendChild(button("Not now", "", () => done("no")));
      card.appendChild(btns);
      approvalResolve = () => done("no");
      add(card);
    });
    if (choice === "no") return { ok: false, output: "The user did not give GYSM access to this site." };
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: [choice === "all" ? "<all_urls>" : origin] });
    } catch {
      granted = false;
    }
    if (!granted) return { ok: false, output: "The user did not give GYSM access to this site." };
    r = await pageCall(tab, fn, args);
    return r;
  }

  function waitForLoad(tabId, ms = 15000) {
    return new Promise((resolve) => {
      let sawLoading = false;
      const timer = setTimeout(done, ms);
      function listener(id, info) {
        if (id !== tabId) return;
        if (info.status === "loading") sawLoading = true;
        if (info.status === "complete" && sawLoading) done();
      }
      function done() {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 400);
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  /** Runs one client_tool call the agent asked for. Returns the clientResult body. */
  async function runClientTool(call) {
    const { toolCallId, name, args } = call;
    const reply = (ok, output, declined) => ({ clientResult: { toolCallId, ok, output, declined: declined || undefined } });
    const tab = await activeTab();

    if (name === "browser_tabs") {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const lines = tabs.map((t) => `${t.active ? "* " : "  "}${isWebUrl(t.url || "") ? `${t.title || "(untitled)"} — ${t.url}` : "(browser page)"}`);
      return reply(true, lines.join("\n") || "No tabs.");
    }
    if (name === "browser_read") {
      const r = await withPermission(tab, "read", []);
      return reply(r.ok, r.output);
    }
    if (name === "browser_scroll") {
      const r = await withPermission(tab, "scroll", [args && args.direction === "up" ? "up" : "down"]);
      return reply(r.ok, r.output);
    }

    if (name === "browser_navigate") {
      let url;
      try {
        const u = new URL(String(args && args.url));
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
        if (u.username || u.password) throw new Error("credentials");
        url = u.toString();
      } catch {
        return reply(false, "That address can't be opened. Use a normal http(s) address.");
      }
      if (!tab) return reply(false, "There is no tab to use.");
      const ok = await ask(`Open ${hostOf(url)}`, url, null, "Open it");
      if (!ok) return reply(false, "", true);
      const loaded = waitForLoad(tab.id);
      await chrome.tabs.update(tab.id, { url });
      await loaded;
      const t = await chrome.tabs.get(tab.id);
      refreshChip();
      return reply(true, `Opened ${t.url}. Title: ${t.title || "(none)"}. Call browser_read to see the page.`);
    }

    if (name === "browser_click" || name === "browser_type") {
      const id = Number(args && args.id);
      const d = await withPermission(tab, "describe", [id]);
      if (!d.ok) return reply(false, d.output);
      if (name === "browser_type" && d.secret) return reply(false, "Refused: that is a password, card or code field. Ask the user to fill it in themselves.");
      const label = d.label || "(no label)";
      let what;
      let detail = null;
      if (name === "browser_click") what = `Click ${d.kind} “${label}”`;
      else {
        what = `Type into “${label}”${args.submit ? " and press Enter" : ""}`;
        detail = String(args.text || "").slice(0, 2000);
      }
      const ok = await ask(what, `on ${d.host}`, detail, name === "browser_click" ? "Click" : "Type it");
      if (!ok) return reply(false, "", true);
      const r = await withPermission(tab, name === "browser_click" ? "click" : "type", name === "browser_click" ? [id] : [id, String(args.text || ""), args.submit === true]);
      await new Promise((res) => setTimeout(res, 600));
      refreshChip();
      return reply(r.ok, r.output);
    }
    return reply(false, `Unknown browser tool: ${name}`);
  }

  // ---------- talking to the agent ----------
  function setBusy(v) {
    busy = v;
    $("send").hidden = v;
    $("stop").hidden = !v;
    $("input").disabled = false;
  }

  function showPlan(steps) {
    const box = $("plan");
    if (!Array.isArray(steps) || !steps.length) {
      box.hidden = true;
      return;
    }
    box.textContent = "";
    const ul = el("ul");
    for (const s of steps) {
      const li = el("li", s.status === "done" ? "done" : s.status === "doing" ? "doing" : "", `${s.status === "done" ? "✓ " : s.status === "doing" ? "• " : "○ "}${s.title}`);
      ul.appendChild(li);
    }
    box.appendChild(ul);
    box.hidden = false;
  }
  function showChips(options, onPick) {
    const box = $("chips");
    box.textContent = "";
    if (!options || !options.length) {
      box.hidden = true;
      return;
    }
    for (const o of options) box.appendChild(button(String(o), "chip", () => onPick(String(o))));
    box.hidden = false;
  }

  function signInNeeded() {
    showBanner((b) => {
      b.appendChild(document.createTextNode("Sign in to gysm.io in Chrome so GYSM Agent can work for you."));
      b.appendChild(el("br"));
      b.appendChild(button("Open gysm.io sign-in", "ghost", () => chrome.tabs.create({ url: API + "/sign-in" })));
      b.appendChild(
        button("I've signed in", "ghost", () => {
          hideBanner();
          if (lastBody) void run(lastBody);
        })
      );
    });
  }

  /** Streams one request. Returns the client_tool the agent asked for, if any. */
  async function streamOnce(body) {
    lastBody = body;
    abort = new AbortController();
    let clientCall = null;
    let res;
    try {
      res = await fetch(API + "/api/agent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({ ...body, browser: true, messages: history }),
      });
    } catch (e) {
      if (!stopped) {
        note("Couldn't reach gysm.io. Check your connection and try again.", "error");
      }
      return null;
    }
    const type = res.headers.get("content-type") || "";
    if (res.status === 401 || res.status === 403) {
      signInNeeded();
      return null;
    }
    if (/text\/html/.test(type)) {
      signInNeeded();
      return null;
    }
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      const msg = j && j.code === "NO_PLAN" ? "Subscribe to GYSM (€20/month) at gysm.io to keep going." : (j && j.error) || "Something went wrong. Try again.";
      note(msg, "error");
      remember({ k: "note", text: msg, tone: "error" });
      return null;
    }
    hideBanner();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const tools = new Map();
    let buf = "";
    const handle = async (e) => {
      switch (e.type) {
        case "text":
          aiBubble(e.text);
          remember({ k: "ai", text: e.text });
          break;
        case "tool": {
          const row = el("div", "step run");
          row.appendChild(el("span", "dot"));
          row.appendChild(el("span", "", e.summary));
          tools.set(e.toolCallId, row);
          add(row);
          break;
        }
        case "tool_result": {
          const row = tools.get(e.toolCallId);
          if (row) row.className = "step " + (e.ok ? "ok" : "bad");
          break;
        }
        case "client_tool": {
          clientCall = e;
          const row = el("div", "step run");
          row.appendChild(el("span", "dot"));
          row.appendChild(el("span", "", e.summary));
          tools.set(e.toolCallId, row);
          add(row);
          break;
        }
        case "proposal":
          // Asked after the stream ends (the server stops the turn here).
          proposal = e;
          break;
        case "declined":
          note("Declined", "muted");
          break;
        case "plan":
          showPlan(e.steps);
          break;
        case "question":
          aiBubble(e.question);
          remember({ k: "ai", text: e.question });
          showChips(e.options, (o) => {
            showChips([]);
            void submit(o);
          });
          break;
        case "file": {
          const a = el("a", "chip", `Download ${e.name}`);
          a.href = `data:${e.mime};base64,${e.data}`;
          a.download = e.name;
          add(a);
          break;
        }
        case "credits":
          if (e.balance) $("input").placeholder = `What should I do in this tab? (${e.balance} credits left)`;
          break;
        case "state":
          history = Array.isArray(e.messages) ? e.messages : history;
          save();
          break;
        case "error":
          note(e.error, "error");
          remember({ k: "note", text: e.error, tone: "error" });
          break;
        default:
          break;
      }
    };
    let proposal = null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            await handle(JSON.parse(line));
          } catch {
            /* skip malformed line */
          }
        }
      }
    } catch {
      if (!stopped) note("The connection dropped. Try again.", "error");
    }
    if (proposal && !stopped) {
      if (proposal.secretInput) {
        note("This step needs a secret value. Open gysm.io/agent to continue it there.", "error");
        return null;
      }
      const ok = await ask(proposal.summary, proposal.project ? `Folder: ${proposal.project}` : null, proposal.detail || null, proposal.name === "deploy" ? "Deploy" : "Approve");
      return { decision: { toolCallId: proposal.toolCallId, approve: ok } };
    }
    return clientCall ? { clientCall } : null;
  }

  async function run(body) {
    if (busy) return;
    stopped = false;
    setBusy(true);
    showChips([]);
    let next = body;
    try {
      while (next && !stopped) {
        const r = await streamOnce(next);
        if (!r || stopped) break;
        if (r.decision) next = { decision: r.decision };
        else if (r.clientCall) next = await runClientTool(r.clientCall);
        else next = null;
      }
    } finally {
      setBusy(false);
      refreshChip();
    }
  }

  async function submit(text) {
    text = String(text || "").trim();
    if (!text && !shot) return;
    if (busy) return;
    const body = { text: text || "Here is a screenshot of my tab." };
    if (shot) {
      body.attachments = [shot];
    }
    userBubble(text || "(screenshot)" + (shot ? " 📷" : ""));
    remember({ k: "user", text: text || "(screenshot)" });
    $("input").value = "";
    clearShot();
    showPlan([]);
    await run(body);
  }

  // ---------- screenshot ----------
  function clearShot() {
    shot = null;
    $("shot-row").hidden = true;
  }
  async function takeShot() {
    try {
      const tab = await activeTab();
      if (!tab || !isWebUrl(tab.url || "")) return note("Open a normal web page first.", "error");
      const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 });
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      const scale = Math.min(1, 1280 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", 0.7);
      shot = { name: "screenshot.jpg", mime: "image/jpeg", data: out.split(",")[1] };
      $("shot-img").src = out;
      $("shot-row").hidden = false;
    } catch (e) {
      note("Couldn't take a screenshot of this tab. Chrome may need your OK for this site (click the GYSM toolbar button on that tab).", "error");
    }
  }

  // ---------- wiring ----------
  $("composer").addEventListener("submit", (ev) => {
    ev.preventDefault();
    void submit($("input").value);
  });
  $("input").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      void submit($("input").value);
    }
  });
  $("stop").addEventListener("click", () => {
    stopped = true;
    if (abort) abort.abort();
    if (approvalResolve) approvalResolve(false);
    setBusy(false);
    note("Stopped.", "muted");
  });
  $("new-chat").addEventListener("click", () => {
    if (busy) {
      stopped = true;
      if (abort) abort.abort();
      if (approvalResolve) approvalResolve(false);
      setBusy(false);
    }
    history = [];
    transcript = [];
    log.querySelectorAll(":scope > :not(#empty)").forEach((n) => n.remove());
    $("empty").hidden = false;
    showPlan([]);
    showChips([]);
    hideBanner();
    clearShot();
    save();
  });
  $("shot").addEventListener("click", () => void takeShot());
  $("shot-x").addEventListener("click", clearShot);
  document.querySelectorAll(".starters .chip").forEach((b) =>
    b.addEventListener("click", () => {
      void submit(b.getAttribute("data-prompt"));
    })
  );

  // Text handed over by the right-click menu.
  async function takePrefill() {
    try {
      const got = await chrome.storage.session.get("gysmPrefill");
      const p = got && got.gysmPrefill;
      if (p && Date.now() - p.at < 60000) {
        $("input").value = p.text;
        $("input").focus();
        await chrome.storage.session.remove("gysmPrefill");
      }
    } catch {
      /* no session storage */
    }
  }
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "session" && changes.gysmPrefill) void takePrefill();
    });
    chrome.tabs.onActivated.addListener(() => void refreshChip());
    chrome.tabs.onUpdated.addListener((id, info) => {
      if (info.status === "complete" || info.title) void refreshChip();
    });
  } catch {
    /* running outside the extension */
  }

  setBusy(false);
  void restore().then(() => {
    void takePrefill();
    void refreshChip();
  });
})();
