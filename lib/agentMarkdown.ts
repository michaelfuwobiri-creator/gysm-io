// Tiny, dependency-free Markdown parser for the agent's replies. It returns a
// plain tree (never HTML), so the UI renders it with React elements and
// nothing the model writes can inject markup or scripts. Links are limited to
// http(s) and mailto.

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "code"; lang: string; v: string }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] };

const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\[[^\]\n]+\]\((?:https?:\/\/[^\s)]+|mailto:[^\s)]+)\))|(\*[^*\s][^*\n]*?\*)|(\b_[^_\s][^_\n]*?_\b)/;

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push({ t: "text", v: rest });
      break;
    }
    if (m.index > 0) out.push({ t: "text", v: rest.slice(0, m.index) });
    const tok = m[0];
    if (m[1]) out.push({ t: "code", v: tok.slice(1, -1) });
    else if (m[2]) out.push({ t: "strong", c: depth < 3 ? parseInline(tok.slice(2, -2), depth + 1) : [{ t: "text", v: tok.slice(2, -2) }] });
    else if (m[3]) {
      const close = tok.indexOf("](");
      out.push({ t: "link", href: tok.slice(close + 2, -1), c: [{ t: "text", v: tok.slice(1, close) }] });
    } else out.push({ t: "em", c: depth < 3 ? parseInline(tok.slice(1, -1), depth + 1) : [{ t: "text", v: tok.slice(1, -1) }] });
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

const UL_RE = /^\s*[-*•]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const H_RE = /^(#{1,3})\s+(.*)$/;
const FENCE_RE = /^\s*```\s*([\w+-]*)\s*$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of text)
      blocks.push({ t: "code", lang: fence[1] || "", v: body.join("\n") });
      continue;
    }
    const h = H_RE.exec(line);
    if (h) {
      blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, c: parseInline(h[2].trim()) });
      i++;
      continue;
    }
    if (UL_RE.test(line) || OL_RE.test(line)) {
      const ordered = OL_RE.test(line) && !UL_RE.test(line);
      const re = ordered ? OL_RE : UL_RE;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(parseInline(re.exec(lines[i])![1].trim()));
        i++;
      }
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) parts.push(QUOTE_RE.exec(lines[i++])![1]);
      blocks.push({ t: "quote", c: parseInline(parts.join("\n")) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !FENCE_RE.test(lines[i]) && !H_RE.test(lines[i]) && !UL_RE.test(lines[i]) && !OL_RE.test(lines[i]) && !QUOTE_RE.test(lines[i])) para.push(lines[i++]);
    blocks.push({ t: "p", c: parseInline(para.join("\n")) });
  }
  return blocks;
}
