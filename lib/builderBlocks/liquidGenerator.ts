import { BLOCK_DEFS, type BlockType, type BuilderBlock, type PropField } from "./blockDefs";

// Turns the same block tree codeGenerator.ts turns into HTML into a single
// Shopify Online Store 2.0 *section* file (sections/<handle>.liquid).
//
// Every canvas block becomes a section block with real theme-editor
// settings (so merchants can edit the copy without touching code), and the
// canvas contents are written into the schema `presets` so dropping the
// section into a theme reproduces what was designed here. Where Shopify has
// a native equivalent it is used instead of a visual stub: Auth links to the
// theme's customer login/account routes, Form renders a real
// {% form 'contact' %}, AI Image becomes an image_picker.

const MAX_SECTION_NAME = 25; // Shopify limits schema names to 25 chars.

function snake(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

// Values land inside the {% schema %} JSON and as Liquid defaults, so make
// sure user text can never open a Liquid tag/output or close the schema.
function safeText(v: unknown): string {
  return String(v ?? "").replace(/\{%/g, "{ %").replace(/%\}/g, "% }").replace(/\{\{/g, "{ {").replace(/\}\}/g, "} }");
}

export function sectionHandle(projectName: string): string {
  const base = String(projectName || "section")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `gysm-${base || "section"}`;
}

function settingFor(field: PropField, def: unknown) {
  const id = snake(field.key);
  switch (field.kind) {
    case "boolean":
      return { type: "checkbox", id, label: field.label, default: Boolean(def) };
    case "number":
      return { type: "number", id, label: field.label, default: Number(def) || 0 };
    case "textarea":
      return { type: "textarea", id, label: field.label, default: safeText(def) };
    default:
      return { type: "text", id, label: field.label, default: safeText(def) };
  }
}

// Extra Shopify-only settings a block type needs on top of its canvas props.
const EXTRA_SETTINGS: Partial<Record<BlockType, any[]>> = {
  hero: [{ type: "url", id: "cta_link", label: "Button link" }],
  payment: [{ type: "url", id: "button_link", label: "Button link" }],
  aiImage: [{ type: "image_picker", id: "image", label: "Image" }],
};

function schemaBlocks() {
  return (Object.keys(BLOCK_DEFS) as BlockType[]).map((type) => {
    const def = BLOCK_DEFS[type];
    return {
      type,
      name: def.label,
      settings: [
        ...def.propFields.map((f) => settingFor(f, def.defaultProps[f.key])),
        ...(EXTRA_SETTINGS[type] || []),
      ],
    };
  });
}

function presetBlock(b: BuilderBlock) {
  const def = BLOCK_DEFS[b.type];
  if (!def) return null;
  const settings: Record<string, unknown> = {};
  for (const f of def.propFields) {
    const raw = b.props?.[f.key] ?? def.defaultProps[f.key];
    settings[snake(f.key)] = f.kind === "boolean" ? Boolean(raw) : f.kind === "number" ? Number(raw) || 0 : safeText(raw);
  }
  return { type: b.type, settings };
}

const STYLES = `.gysm-{{ section.id }}{background:{{ section.settings.background }};color:{{ section.settings.text_color }};font-family:inherit}
.gysm-{{ section.id }} *{box-sizing:border-box}
.gysm-{{ section.id }} .g-btn{display:inline-block;background:{{ section.settings.accent }};color:#fff;border:0;border-radius:999px;padding:12px 28px;font-weight:700;text-decoration:none;cursor:pointer}
.gysm-{{ section.id }} .g-card{max-width:480px;margin:24px auto;border:1px solid rgba(128,128,128,.25);border-radius:16px;padding:20px}
.gysm-{{ section.id }} .g-input{width:100%;margin-bottom:10px;background:transparent;border:1px solid rgba(128,128,128,.4);border-radius:10px;padding:10px 14px;color:inherit}
.gysm-{{ section.id }} .g-pill{display:inline-block;font-size:12px;background:rgba(128,128,128,.18);border-radius:999px;padding:4px 10px;margin:0 6px 6px 0}
.gysm-{{ section.id }} .g-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(128,128,128,.25)}
.gysm-{{ section.id }} .g-hero{text-align:center;padding:96px 24px}
.gysm-{{ section.id }} .g-hero h1{font-size:48px;font-weight:900;letter-spacing:-.03em;margin:0 0 16px}
.gysm-{{ section.id }} .g-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.gysm-{{ section.id }} .g-list li{border:1px solid rgba(128,128,128,.25);border-radius:10px;padding:12px 16px}`;

const RENDER = `{%- for block in section.blocks -%}
  {%- case block.type -%}

    {%- when 'header' -%}
      <header class="g-header" {{ block.shopify_attribute }}>
        <div style="font-weight:900">{{ block.settings.title }}</div>
        {%- if block.settings.show_auth -%}
          {%- if customer -%}
            <a class="g-btn" href="{{ routes.account_url }}">{{ 'customer.account.title' | t }}</a>
          {%- else -%}
            <a class="g-btn" href="{{ routes.account_login_url }}">{{ 'customer.login.title' | t }}</a>
          {%- endif -%}
        {%- endif -%}
      </header>

    {%- when 'hero' -%}
      <div class="g-hero" {{ block.shopify_attribute }}>
        <h1>{{ block.settings.headline }}</h1>
        <p style="opacity:.6;font-size:18px;margin:0 0 32px">{{ block.settings.subheadline }}</p>
        <a class="g-btn" href="{{ block.settings.cta_link | default: '#' }}">{{ block.settings.cta_text }}</a>
      </div>

    {%- when 'auth' -%}
      <div style="display:flex;justify-content:center;padding:24px" {{ block.shopify_attribute }}>
        {%- if customer -%}
          {%- if block.settings.show_user_button -%}
            <a class="g-btn" href="{{ routes.account_url }}">{{ customer.first_name | default: customer.email }}</a>
          {%- endif -%}
        {%- else -%}
          <a class="g-btn" href="{{ routes.account_login_url }}">{{ block.settings.button_text }}</a>
        {%- endif -%}
      </div>

    {%- when 'payment' -%}
      <div class="g-card" style="max-width:320px;text-align:center;padding:32px" {{ block.shopify_attribute }}>
        <div style="font-weight:800;font-size:20px">{{ block.settings.plan_name }}</div>
        <div style="font-size:36px;font-weight:900;margin:12px 0">{{ block.settings.price | times: 100 | money_without_trailing_zeros }}<span style="font-size:14px;opacity:.5">/mo</span></div>
        <a class="g-btn" style="width:100%" href="{{ block.settings.button_link | default: routes.cart_url }}">{{ block.settings.button_text }}</a>
      </div>

    {%- when 'chat' -%}
      <div class="g-card" style="padding:0;overflow:hidden" {{ block.shopify_attribute }}>
        <div style="padding:12px 16px;border-bottom:1px solid rgba(128,128,128,.25);font-weight:700">{{ block.settings.title }}</div>
        <div style="min-height:160px;padding:16px;opacity:.4;font-size:13px">No messages yet.</div>
        <div style="padding:12px;border-top:1px solid rgba(128,128,128,.25)">
          <input class="g-input" style="margin:0;border-radius:999px" placeholder="{{ block.settings.placeholder | escape }}" disabled>
        </div>
      </div>

    {%- when 'database' -%}
      <div class="g-card" {{ block.shopify_attribute }}>
        <div style="font-weight:700;margin-bottom:8px">Table: {{ block.settings.table_name }}</div>
        {%- assign fields = block.settings.fields | split: ',' -%}
        {%- for f in fields -%}<span class="g-pill">{{ f | strip }}</span>{%- endfor -%}
      </div>

    {%- when 'form' -%}
      <div style="max-width:420px;margin:24px auto" {{ block.shopify_attribute }}>
        {%- form 'contact', id: block.id -%}
          <h3 style="font-weight:800;margin:0 0 16px">{{ block.settings.title }}</h3>
          {%- if form.posted_successfully? -%}
            <p>{{ 'templates.contact.form.post_success' | t }}</p>
          {%- endif -%}
          {%- if form.errors -%}
            <p style="color:#e11d48">{{ form.errors | default_errors }}</p>
          {%- endif -%}
          {%- assign fields = block.settings.fields | split: ',' -%}
          {%- for f in fields -%}
            {%- assign label = f | strip -%}
            {%- assign key = label | handleize -%}
            {%- if key == 'email' -%}
              <input class="g-input" type="email" name="contact[email]" placeholder="{{ label | escape }}" autocomplete="email" required>
            {%- elsif key == 'message' or key == 'body' -%}
              <textarea class="g-input" name="contact[body]" placeholder="{{ label | escape }}" rows="4"></textarea>
            {%- else -%}
              <input class="g-input" name="contact[{{ key }}]" placeholder="{{ label | escape }}">
            {%- endif -%}
          {%- endfor -%}
          <button class="g-btn" style="width:100%;border-radius:10px" type="submit">{{ block.settings.submit_text }}</button>
        {%- endform -%}
      </div>

    {%- when 'list' -%}
      <div style="max-width:480px;margin:24px auto" {{ block.shopify_attribute }}>
        <h3 style="font-weight:800;margin:0 0 12px">{{ block.settings.title }}</h3>
        <ul class="g-list">
          {%- assign items = block.settings.items | split: ',' -%}
          {%- for item in items -%}<li>{{ item | strip }}</li>{%- endfor -%}
        </ul>
      </div>

    {%- when 'aiImage' -%}
      <div style="max-width:480px;margin:24px auto" {{ block.shopify_attribute }}>
        {%- if block.settings.image != blank -%}
          {{ block.settings.image | image_url: width: 1200 | image_tag: alt: block.settings.alt, loading: 'lazy', style: 'width:100%;border-radius:16px;height:auto' }}
        {%- else -%}
          <div style="aspect-ratio:16/9;border-radius:16px;background:linear-gradient(135deg,{{ section.settings.accent }},#7C3AED);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;text-align:center;padding:16px" role="img" aria-label="{{ block.settings.alt | escape }}">
            {{ block.settings.prompt }}
          </div>
        {%- endif -%}
      </div>

  {%- endcase -%}
{%- endfor -%}`;

export function generateLiquid(blocks: BuilderBlock[], projectName: string): string {
  const name = safeText(projectName || "GYSM section").slice(0, MAX_SECTION_NAME);
  const presetBlocks = blocks.map(presetBlock).filter(Boolean);

  const schema = {
    name,
    tag: "section",
    class: "gysm-section",
    settings: [
      { type: "color", id: "background", label: "Background", default: "#0A0A0A" },
      { type: "color", id: "text_color", label: "Text color", default: "#FFFFFF" },
      { type: "color", id: "accent", label: "Accent color", default: "#FF0080" },
    ],
    blocks: schemaBlocks(),
    presets: [{ name, blocks: presetBlocks }],
  };

  return `{%- comment -%}
  ${safeText(projectName || "GYSM section")} -- generated by GYSM (gysm.io).
  Install: Shopify admin > Online Store > Themes > ... > Edit code > Sections >
  Add a new section named "${sectionHandle(projectName)}" and paste this file.
  Then add it from the theme editor (Add section > ${name}).
{%- endcomment -%}

<style>
${STYLES}
</style>

<div class="gysm-{{ section.id }}">
${RENDER.split("\n").map((l) => (l ? "  " + l : l)).join("\n")}
  {%- if section.blocks.size == 0 -%}
    <div style="padding:96px;text-align:center;opacity:.4">Add a block in the theme editor to get started.</div>
  {%- endif -%}
</div>

{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
}
