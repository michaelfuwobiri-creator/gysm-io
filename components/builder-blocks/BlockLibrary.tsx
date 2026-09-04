"use client";

import { useDraggable } from "@dnd-kit/core";
import { BLOCK_DEFS, BLOCK_ORDER } from "@/lib/builderBlocks/blockDefs";

// Draggable palette on the left. Each entry is a dnd-kit draggable with
// `data: { source: "library", type }` -- BuilderBlocksClient's onDragEnd
// reads that to tell "drag a new block in from the library" apart from
// "reorder an existing block already on the canvas" (BuilderCanvas.tsx's
// sortable items only ever carry a block id, no `source`).
function LibraryItem({ type }: { type: (typeof BLOCK_ORDER)[number] }) {
  const def = BLOCK_DEFS[type];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${type}`,
    data: { source: "library", type },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`w-full text-left rounded-xl border border-black/10 bg-white p-3 transition cursor-grab active:cursor-grabbing hover:border-[#FF0080]/40 hover:shadow-sm ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="text-[13px] font-bold">{def.label}</div>
      <div className="text-[11px] opacity-50 mt-0.5 leading-snug">{def.description}</div>
    </button>
  );
}

export default function BlockLibrary() {
  return (
    <div className="w-[220px] shrink-0 border-r border-black/10 bg-[#FAFAF7] p-3 overflow-y-auto">
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-40 px-1 mb-2">Blocks</div>
      <div className="flex flex-col gap-2">
        {BLOCK_ORDER.map((type) => (
          <LibraryItem key={type} type={type} />
        ))}
      </div>
    </div>
  );
}
