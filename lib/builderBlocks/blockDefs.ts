// Block type registry for the drag-and-drop builder core (/builder-blocks).
// Single source of truth for: what block types exist, their default props
// when dropped fresh onto the canvas, and the prop schema PropsPanel.tsx
// renders as editable fields. Keeping this data-driven (rather than a
// switch statement per component) means BlockLibrary, PropsPanel, and
// codeGenerator all stay in sync off one list instead of three.
export type BlockType =
  | "header"
  | "hero"
  | "auth"
  | "payment"
  | "chat"
  | "database"
  | "form"
  | "list"
  | "aiImage";

export type PropField =
  | { key: string; kind: "text"; label: string }
  | { key: string; kind: "textarea"; label: string }
  | { key: string; kind: "number"; label: string }
  | { key: string; kind: "boolean"; label: string };

export type BlockDef = {
  type: BlockType;
  label: string;
  description: string;
  defaultProps: Record<string, unknown>;
  propFields: PropField[];
};

export const BLOCK_DEFS: Record<BlockType, BlockDef> = {
  header: {
    type: "header",
    label: "Header",
    description: "Top nav bar with a title and optional auth controls.",
    defaultProps: { title: "Your App", showAuth: true },
    propFields: [
      { key: "title", kind: "text", label: "Title" },
      { key: "showAuth", kind: "boolean", label: "Show auth controls" },
    ],
  },
  hero: {
    type: "hero",
    label: "Hero",
    description: "Headline, subheadline, and a call-to-action button.",
    defaultProps: {
      headline: "Build something great",
      subheadline: "Describe it. Ship it.",
      ctaText: "Get Started",
    },
    propFields: [
      { key: "headline", kind: "text", label: "Headline" },
      { key: "subheadline", kind: "textarea", label: "Subheadline" },
      { key: "ctaText", kind: "text", label: "Button text" },
    ],
  },
  auth: {
    type: "auth",
    label: "Auth",
    description: "Real Clerk sign-in -- SignInButton when signed out, UserButton when signed in.",
    defaultProps: { showUserButton: true, buttonText: "Sign In" },
    propFields: [
      { key: "showUserButton", kind: "boolean", label: "Show UserButton when signed in" },
      { key: "buttonText", kind: "text", label: "Sign-in button text" },
    ],
  },
  payment: {
    type: "payment",
    label: "Payment",
    description: "A pricing card wired to your Stripe checkout pattern.",
    defaultProps: { planName: "Pro", price: 29, buttonText: "Subscribe" },
    propFields: [
      { key: "planName", kind: "text", label: "Plan name" },
      { key: "price", kind: "number", label: "Price (USD/mo)" },
      { key: "buttonText", kind: "text", label: "Button text" },
    ],
  },
  chat: {
    type: "chat",
    label: "Chat",
    description: "A chat panel shell -- title, placeholder, message list.",
    defaultProps: { title: "Chat", placeholder: "Type a message..." },
    propFields: [
      { key: "title", kind: "text", label: "Title" },
      { key: "placeholder", kind: "text", label: "Input placeholder" },
    ],
  },
  database: {
    type: "database",
    label: "Database",
    description: "A table preview -- name it and list its fields.",
    defaultProps: { tableName: "items", fields: "id, name, createdAt" },
    propFields: [
      { key: "tableName", kind: "text", label: "Table name" },
      { key: "fields", kind: "text", label: "Fields (comma-separated)" },
    ],
  },
  form: {
    type: "form",
    label: "Form",
    description: "A labeled input form with a submit button.",
    defaultProps: { title: "Contact us", fields: "Name, Email", submitText: "Submit" },
    propFields: [
      { key: "title", kind: "text", label: "Title" },
      { key: "fields", kind: "text", label: "Fields (comma-separated)" },
      { key: "submitText", kind: "text", label: "Submit button text" },
    ],
  },
  list: {
    type: "list",
    label: "List",
    description: "A repeating list of items, e.g. for feeds or catalogs.",
    defaultProps: { title: "Items", items: "Item one, Item two, Item three" },
    propFields: [
      { key: "title", kind: "text", label: "Title" },
      { key: "items", kind: "textarea", label: "Items (comma-separated)" },
    ],
  },
  aiImage: {
    type: "aiImage",
    label: "AI Image",
    description: "An AI-generated image placeholder driven by a prompt.",
    defaultProps: { prompt: "A vibrant abstract background", alt: "AI generated image" },
    propFields: [
      { key: "prompt", kind: "textarea", label: "Image prompt" },
      { key: "alt", kind: "text", label: "Alt text" },
    ],
  },
};

export const BLOCK_ORDER: BlockType[] = ["header", "hero", "auth", "payment", "chat", "database", "form", "list", "aiImage"];

export type BuilderBlock = {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
};

export function createBlock(type: BlockType): BuilderBlock {
  return {
    id: `blk_${Math.random().toString(36).slice(2, 10)}`,
    type,
    props: { ...BLOCK_DEFS[type].defaultProps },
  };
}
