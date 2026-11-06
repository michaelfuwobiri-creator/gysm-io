import { describe, expect, it } from "vitest";
import { applyEdit, htmlToText, isBlockedHostname, isBlockedIp, parseFetchUrl, validEnvKey, validateReadSql } from "@/lib/agentGuards";

describe("validateReadSql", () => {
  it("accepts a plain select and wraps it with a row cap", () => {
    const r = validateReadSql("select id, title from todos where done = false order by id;");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toBe("select * from (select id, title from todos where done = false order by id) as gysm_q limit 100");
  });
  it("accepts a CTE select and string values that contain keywords", () => {
    expect(validateReadSql("with t as (select * from a) select * from t").ok).toBe(true);
    expect(validateReadSql("select * from notes where body = 'please delete; drop table x'").ok).toBe(true);
    expect(validateReadSql("select updated_at, created_at from a").ok).toBe(true);
  });
  it.each([
    "delete from todos",
    "update todos set done = true",
    "insert into todos values (1)",
    "drop table todos",
    "select 1; select 2",
    "select 1; drop table a",
    "select * into newt from todos",
    "select * from todos for update",
    "with d as (delete from todos returning *) select * from d",
    "select pg_sleep(10)",
    "select * from pg_user",
    "select * from auth.users",
    'select * from "auth"."users"',
    "select * from storage.objects",
    "select * from information_schema.tables",
    "select set_config('a','b',false)",
    "select * from dblink('x','y') as t(a int)",
    "explain select 1",
    "create table a(id int)",
    "select 1 /* x */ ; /* y */ delete from a",
    "",
  ])("rejects %j", (q) => {
    expect(validateReadSql(q).ok).toBe(false);
  });
});

describe("validEnvKey", () => {
  it("accepts normal names and rejects reserved ones", () => {
    expect(validEnvKey("STRIPE_SECRET_KEY")).toBe("STRIPE_SECRET_KEY");
    for (const k of ["lower", "1ABC", "VERCEL_URL", "NODE_ENV", "PATH", "A B", "", "__proto__", "NODE_OPTIONS", "X".repeat(65)]) expect(validEnvKey(k)).toBeNull();
  });
});

describe("outbound fetch guards", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isBlockedIp(ip)).toBe(true)
  );
  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));

  it("blocks internal hostnames", () => {
    for (const h of ["localhost", "a.localhost", "printer.local", "metadata.google.internal", "intranet", "127.0.0.1", "[::1]", "10.0.0.5"]) expect(isBlockedHostname(h)).toBe(true);
    expect(isBlockedHostname("docs.example.com")).toBe(false);
  });

  it("parses public URLs and rejects the rest", () => {
    expect(parseFetchUrl("https://docs.example.com/a?b=1").ok).toBe(true);
    for (const u of ["ftp://x.com", "file:///etc/passwd", "javascript:alert(1)", "http://localhost/", "http://127.0.0.1:80/", "https://user:pw@example.com/", "https://example.com:8080/", "http://169.254.169.254/latest/meta-data", "not a url", "", null]) {
      expect(parseFetchUrl(u as any).ok).toBe(false);
    }
  });
});

describe("htmlToText", () => {
  it("strips scripts, styles and tags, keeps text and entities", () => {
    const t = htmlToText("<html><head><title>x</title><style>a{}</style></head><body><script>evil()</script><h1>Hi &amp; bye</h1><p>One</p><p>Two</p></body></html>");
    expect(t).toBe("Hi & bye\nOne\nTwo");
    expect(t).not.toMatch(/evil|a\{\}/);
  });
});

describe("applyEdit", () => {
  it("replaces a unique match", () => {
    const r = applyEdit("a b c", "b", "X", false);
    expect(r).toEqual({ ok: true, content: "a X c", count: 1 });
  });
  it("fails when missing or ambiguous, unless replace_all", () => {
    expect(applyEdit("a a", "z", "y", false).ok).toBe(false);
    expect(applyEdit("a a", "a", "y", false).ok).toBe(false);
    expect(applyEdit("a a", "a", "y", true)).toEqual({ ok: true, content: "y y", count: 2 });
  });
  it("treats $ in the replacement literally and rejects an empty find", () => {
    expect(applyEdit("price", "price", "$& $1", false)).toEqual({ ok: true, content: "$& $1", count: 1 });
    expect(applyEdit("abc", "", "x", false).ok).toBe(false);
  });
});

import { analyzeHtml, extractSameOriginLinks, cleanSuggestions } from "@/lib/agentGuards";

describe("analyzeHtml", () => {
  const good = `<!doctype html><html lang="en"><head><title>Sunrise Bakery - fresh bread daily</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Fresh bread and pastries baked every morning in the heart of town, with free delivery nearby.">
    <meta property="og:title" content="x"><meta property="og:image" content="y"><link rel="canonical" href="https://a.com/"></head>
    <body><h1>Sunrise Bakery</h1><img src="a.png" alt="Loaf" width="10" height="10"></body></html>`;
  it("finds nothing wrong on a healthy page", () => {
    expect(analyzeHtml(good)).toEqual([]);
  });
  it("flags the basics on a bare page", () => {
    const f = analyzeHtml("<html><body><img src=a.png><img src=b.png></body></html>");
    const msgs = f.map((x) => x.area + ":" + x.severity);
    expect(msgs).toContain("SEO:high");
    expect(msgs).toContain("Mobile:high");
    expect(f.some((x) => /alt attribute/.test(x.message))).toBe(true);
    expect(f.some((x) => /lang/.test(x.message))).toBe(true);
  });
  it("counts multiple h1s", () => {
    expect(analyzeHtml(good.replace("<h1>Sunrise Bakery</h1>", "<h1>A</h1><h1>B</h1>")).some((x) => /2 <h1>/.test(x.message))).toBe(true);
  });
});

describe("extractSameOriginLinks", () => {
  it("keeps same-origin links only, absolute and de-duplicated", () => {
    const html = `<a href="/a">1</a><a href="/a#x">2</a><a href="https://other.com/b">3</a><a href="mailto:x@y.z">4</a><a href="#top">5</a><a href='page2.html'>6</a>`;
    expect(extractSameOriginLinks(html, "https://site.com/dir/", 10)).toEqual(["https://site.com/a", "https://site.com/dir/page2.html"]);
  });
  it("caps the count", () => {
    const html = Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">x</a>`).join("");
    expect(extractSameOriginLinks(html, "https://s.com", 5)).toHaveLength(5);
  });
});

describe("cleanSuggestions", () => {
  it("keeps up to four valid, unique suggestions", () => {
    const raw = [
      { title: "Fix alt text", prompt: "Add alt text to every image on my site" },
      { title: "fix alt text", prompt: "duplicate title should be dropped" },
      { title: "", prompt: "no title is dropped entirely" },
      { title: "Short", prompt: "x" },
      { title: "Add a contact form", prompt: "Add a contact form to my site" },
      { title: "Add analytics", prompt: "Add privacy-friendly analytics" },
      { title: "Dark mode", prompt: "Add a dark mode toggle" },
      { title: "Fifth", prompt: "This one is over the cap" },
    ];
    const out = cleanSuggestions(raw);
    expect(out.map((s) => s.title)).toEqual(["Fix alt text", "Add a contact form", "Add analytics", "Dark mode"]);
  });
  it("returns nothing for junk", () => {
    expect(cleanSuggestions(null)).toEqual([]);
    expect(cleanSuggestions("x")).toEqual([]);
  });
});


import { cleanPlan } from "@/lib/agentGuards";

describe("cleanPlan", () => {
  it("keeps valid steps, drops empty ones and allows only one 'doing'", () => {
    expect(
      cleanPlan([
        { title: "A", status: "doing" },
        { title: "B", status: "doing" },
        { title: "  ", status: "done" },
        { title: "C", status: "weird" },
      ])
    ).toEqual([
      { title: "A", status: "doing" },
      { title: "B", status: "pending" },
      { title: "C", status: "pending" },
    ]);
  });
  it("caps at 12 steps and rejects non-arrays", () => {
    expect(cleanPlan(Array.from({ length: 20 }, (_, i) => ({ title: `s${i}`, status: "pending" })))).toHaveLength(12);
    expect(cleanPlan("nope")).toEqual([]);
  });
});
