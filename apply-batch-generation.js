// Applies the "Batch Generation (item 35)" change to
// app/builder/LinearBuilderClient.tsx directly by exact text match,
// bypassing `git am` context-line matching (which was failing locally
// even with --ignore-whitespace -- something about the local file's
// exact bytes didn't line up with the generated patch's context).
//
// Usage: from the repo root (same folder as package.json), run:
//   node apply-batch-generation.js
// Then:
//   git add -A
//   git commit -m "Media Factory: add Batch Generation (item 35)"
//   git push

const fs = require("fs");
const path = "app/builder/LinearBuilderClient.tsx";

if (!fs.existsSync(path)) {
  console.error(`Can't find ${path} -- run this from the gysm-io repo root.`);
  process.exit(1);
}

// Normalize to LF so exact-match replacement works regardless of the
// file's current line endings; written back as LF (matches the rest of
// the repo, which has no .gitattributes forcing CRLF).
let src = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const before = src;

function replaceOnce(label, oldStr, newStr) {
  const count = src.split(oldStr).length - 1;
  if (count !== 1) {
    console.error(`FAILED: "${label}" -- expected exactly 1 match, found ${count}. File may already be patched, or differs from what this script expects.`);
    process.exit(1);
  }
  src = src.replace(oldStr, newStr);
  console.log(`OK: ${label}`);
}

replaceOnce(
  "onSend prop type signature",
  `  onSend: (text: string, mediaIds: string[], mediaSkillId?: string) => void;`,
  `  onSend: (text: string, mediaIds: string[], mediaSkillId?: string, batchCount?: number) => void;`
);

replaceOnce(
  "batchCount state",
  `  const [pickedMedia, setPickedMedia] = useState<MediaSkillDef | null>(() =>\n    initialMediaSkillId ? MEDIA_SKILLS.find((s) => s.kind === initialMediaSkillId) || null : null\n  );\n  const [mediaError, setMediaError] = useState("");`,
  `  const [pickedMedia, setPickedMedia] = useState<MediaSkillDef | null>(() =>\n    initialMediaSkillId ? MEDIA_SKILLS.find((s) => s.kind === initialMediaSkillId) || null : null\n  );\n  /** Batch Generation (42-tool spec item 35) -- run the same prompt N\n   *  times in one send, producing N independent result cards/credit\n   *  charges instead of one. Scoped to image generation only (the\n   *  synchronous, cheapest-per-unit skill, and the one where "give me a\n   *  few options" is the real, common use case) rather than every kind. */\n  const [batchCount, setBatchCount] = useState<1 | 2 | 4>(1);\n  useEffect(() => {\n    if (pickedMedia?.kind !== "image") setBatchCount(1);\n  }, [pickedMedia]);\n  const [mediaError, setMediaError] = useState("");`
);

replaceOnce(
  "submit() onSend call",
  `      onSend(text, chatMedia.map((m) => m.id), pickedMedia.id);\n      setInput("");\n      setMediaError("");\n      setPickedMedia(null);\n      if (textareaRef.current) textareaRef.current.style.height = "auto";`,
  `      onSend(text, chatMedia.map((m) => m.id), pickedMedia.id, pickedMedia.kind === "image" ? batchCount : 1);\n      setInput("");\n      setMediaError("");\n      setPickedMedia(null);\n      setBatchCount(1);\n      if (textareaRef.current) textareaRef.current.style.height = "auto";`
);

replaceOnce(
  "picked-skill chip cost + batch toggle",
  `              <span>\n                {pickedMedia.label} -- {pickedMedia.cost} credits\n              </span>\n              {input.trim() && (`,
  `              <span>\n                {pickedMedia.label} -- {pickedMedia.cost * (pickedMedia.kind === "image" ? batchCount : 1)} credits\n                {pickedMedia.kind === "image" && batchCount > 1 ? \` (\${batchCount}x)\` : ""}\n              </span>\n              {pickedMedia.kind === "image" && (\n                <button\n                  onClick={() => setBatchCount((n) => (n === 1 ? 2 : n === 2 ? 4 : 1))}\n                  title="Generate multiple variations from the same prompt in one send"\n                  className="rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] text-white/60 hover:text-white hover:border-white/30"\n                >\n                  Batch: {batchCount}x\n                </button>\n              )}\n              {input.trim() && (`
);

replaceOnce(
  "sendMessage signature + userMsg content",
  `  function sendMessage(text: string, mediaIds: string[], mediaSkillId?: string) {\n    if (!activeChat) return;\n    const chatId = activeChat.id;\n    const mediaSkill = mediaSkillId ? MEDIA_SKILLS.find((s) => s.id === mediaSkillId) : undefined;\n    const userMsg: ChatMessage = {\n      id: uid("msg"),\n      role: "user",\n      content: text || (mediaSkill ? \`[\${mediaSkill.label}]\` : ""),\n      createdAt: Date.now(),\n      mediaIds: mediaIds.length ? mediaIds : undefined,\n    };`,
  `  function sendMessage(text: string, mediaIds: string[], mediaSkillId?: string, batchCount: number = 1) {\n    if (!activeChat) return;\n    const chatId = activeChat.id;\n    const mediaSkill = mediaSkillId ? MEDIA_SKILLS.find((s) => s.id === mediaSkillId) : undefined;\n    // Batch Generation (item 35): clamp regardless of what the composer\n    // sent, and only meaningful for image (matches the composer's own\n    // kind === "image" gate on the batch toggle).\n    const count = mediaSkill?.kind === "image" ? Math.max(1, Math.min(4, Math.round(batchCount))) : 1;\n    const userMsg: ChatMessage = {\n      id: uid("msg"),\n      role: "user",\n      content: (text || (mediaSkill ? \`[\${mediaSkill.label}]\` : "")) + (count > 1 ? \` (batch of \${count})\` : ""),\n      createdAt: Date.now(),\n      mediaIds: mediaIds.length ? mediaIds : undefined,\n    };`
);

replaceOnce(
  "runMediaGeneration loop",
  `    if (mediaSkill) {\n      runMediaGeneration(chatId, text, mediaIds, mediaSkill);\n    } else {\n      runGeneration(chatId, text, firstImage);\n    }\n  }`,
  `    if (mediaSkill) {\n      // Fire all N generations concurrently -- each call creates its own\n      // placeholder message, its own credit deduction, and its own\n      // independent success/failure, exactly like N separate sends would,\n      // just issued in one go instead of one at a time.\n      for (let i = 0; i < count; i++) {\n        runMediaGeneration(chatId, text, mediaIds, mediaSkill);\n      }\n    } else {\n      runGeneration(chatId, text, firstImage);\n    }\n  }`
);

if (src === before) {
  console.error("Nothing changed -- unexpected.");
  process.exit(1);
}

fs.writeFileSync(path, src, "utf8");
console.log("\nAll 6 edits applied successfully to " + path);
