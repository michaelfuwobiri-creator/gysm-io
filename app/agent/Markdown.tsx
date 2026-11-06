"use client";

import { Fragment, useState, type ReactNode } from "react";
import { parseMarkdown, type Inline } from "@/lib/agentMarkdown";

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    if (n.t === "text") return <Fragment key={i}>{n.v}</Fragment>;
    if (n.t === "code") return <code key={i}>{n.v}</code>;
    if (n.t === "strong") return <strong key={i}>{renderInline(n.c)}</strong>;
    if (n.t === "em") return <em key={i}>{renderInline(n.c)}</em>;
    return (
      <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow">
        {renderInline(n.c)}
      </a>
    );
  });
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="gb-codeblock">
      <div className="gb-codehead">
        <span>{lang || "code"}</span>
        <button
          type="button"
          className="gb-ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Renders the agent's reply as formatted text (headings, lists, code, links). */
export default function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="gb-md">
      {blocks.map((b, i) => {
        if (b.t === "p") return <p key={i}>{renderInline(b.c)}</p>;
        if (b.t === "h") return b.level === 1 ? <h3 key={i}>{renderInline(b.c)}</h3> : <h4 key={i}>{renderInline(b.c)}</h4>;
        if (b.t === "code") return <CodeBlock key={i} lang={b.lang} code={b.v} />;
        if (b.t === "quote") return <blockquote key={i}>{renderInline(b.c)}</blockquote>;
        const Tag = b.t === "ol" ? "ol" : "ul";
        return (
          <Tag key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it)}</li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
