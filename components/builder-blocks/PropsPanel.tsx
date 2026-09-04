"use client";

import { useBuilderBlocksStore } from "@/store/builderBlocksStore";
import { BLOCK_DEFS } from "@/lib/builderBlocks/blockDefs";

// Right-hand panel: editable fields for whichever block is selected on
// the canvas. Field list per block type comes from BLOCK_DEFS.propFields
// (lib/builderBlocks/blockDefs.ts) so adding a new prop to a block type
// only requires editing that one registry, not this component.
export default function PropsPanel() {
  const { blocks, selectedId, updateBlockProps, setProjectName, projectName } = useBuilderBlocksStore();
  const block = blocks.find((b) => b.id === selectedId) || null;

  return (
    <div className="w-[260px] shrink-0 border-l border-black/10 bg-[#FAFAF7] p-4 overflow-y-auto">
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-40 mb-2">Project</div>
      <input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-[13px] font-medium mb-6"
      />

      <div className="text-[11px] font-bold uppercase tracking-wide opacity-40 mb-2">Properties</div>
      {!block ? (
        <div className="text-[12px] opacity-40">Select a block on the canvas to edit it.</div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-[13px] font-bold">{BLOCK_DEFS[block.type].label}</div>
          {BLOCK_DEFS[block.type].propFields.map((field) => {
            const value = block.props[field.key];
            if (field.kind === "boolean") {
              return (
                <label key={field.key} className="flex items-center justify-between text-[13px]">
                  <span>{field.label}</span>
                  <input
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => updateBlockProps(block.id, { [field.key]: e.target.checked })}
                    className="accent-[#FF0080]"
                  />
                </label>
              );
            }
            if (field.kind === "textarea") {
              return (
                <label key={field.key} className="flex flex-col gap-1 text-[12px]">
                  <span className="opacity-60">{field.label}</span>
                  <textarea
                    value={String(value ?? "")}
                    onChange={(e) => updateBlockProps(block.id, { [field.key]: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-[13px] resize-none"
                  />
                </label>
              );
            }
            return (
              <label key={field.key} className="flex flex-col gap-1 text-[12px]">
                <span className="opacity-60">{field.label}</span>
                <input
                  type={field.kind === "number" ? "number" : "text"}
                  value={String(value ?? "")}
                  onChange={(e) =>
                    updateBlockProps(block.id, {
                      [field.key]: field.kind === "number" ? Number(e.target.value) : e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-[13px]"
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
