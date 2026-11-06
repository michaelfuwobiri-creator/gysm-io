import { describe, it, expect } from "vitest";
import { generateLiquid, sectionHandle } from "@/lib/builderBlocks/liquidGenerator";
import { BLOCK_ORDER, createBlock } from "@/lib/builderBlocks/blockDefs";

function schemaOf(out: string) {
  const m = out.match(/\{% schema %\}\n([\s\S]*?)\n\{% endschema %\}/);
  if (!m) throw new Error("no schema");
  return JSON.parse(m[1]);
}

describe("generateLiquid", () => {
  const blocks = BLOCK_ORDER.map(createBlock);

  it("emits valid schema JSON with one section block per block type and a matching preset", () => {
    const schema = schemaOf(generateLiquid(blocks, "Demo"));
    expect(schema.blocks.map((b: any) => b.type)).toEqual(BLOCK_ORDER);
    expect(schema.presets[0].blocks).toHaveLength(blocks.length);
  });

  it("only references settings that exist in the schema", () => {
    const out = generateLiquid(blocks, "Demo");
    const ids = new Set(schemaOf(out).blocks.flatMap((b: any) => b.settings.map((s: any) => s.id)));
    const used = Array.from(out.matchAll(/block\.settings\.([a-z_]+)/g)).map((m) => m[1]);
    for (const u of used) expect(ids.has(u)).toBe(true);
  });

  it("keeps the section name within Shopify's 25 character limit", () => {
    expect(schemaOf(generateLiquid(blocks, "x".repeat(80))).name.length).toBeLessThanOrEqual(25);
  });

  it("neutralises Liquid/schema delimiters in user text", () => {
    const b = createBlock("hero");
    b.props.headline = "{% endschema %} {{ shop.secret }}";
    const out = generateLiquid([b], "Demo");
    expect(out.match(/\{% endschema %\}/g)).toHaveLength(1);
    expect(schemaOf(out).presets[0].blocks[0].settings.headline).not.toContain("{{");
  });

  it("builds a safe file handle", () => {
    expect(sectionHandle("My App!!")).toBe("gysm-my-app");
    expect(sectionHandle("")).toBe("gysm-section");
  });
});
