"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBuilderBlocksStore } from "@/store/builderBlocksStore";
import type { BuilderBlock } from "@/lib/builderBlocks/blockDefs";
import BlockRenderer from "./BlockRenderer";

function SortableBlock({ block }: { block: BuilderBlock }) {
  const { selectedId, selectBlock, removeBlock } = useBuilderBlocksStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const selected = selectedId === block.id;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => selectBlock(block.id)}
      className={`relative group rounded-2xl border-2 transition ${
        selected ? "border-[#FF0080]" : "border-transparent hover:border-black/10"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="absolute -top-3 left-3 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-[10px] font-bold uppercase tracking-wide bg-black text-white rounded-full px-2.5 py-1"
        >
          :: drag
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeBlock(block.id);
          }}
          className="text-[10px] font-bold uppercase tracking-wide bg-red-500 text-white rounded-full px-2.5 py-1"
        >
          remove
        </button>
      </div>
      <BlockRenderer block={block} />
    </div>
  );
}

// Droppable canvas + sortable list. `useDroppable({ id: "canvas" })` gives
// BuilderBlocksClient's onDragEnd a stable drop target id to detect
// "dropped a library block onto the canvas" even when the canvas is empty
// (a plain SortableContext alone has nothing to be droppable onto until
// it already contains at least one sortable item).
export default function BuilderCanvas() {
  const { blocks } = useBuilderBlocksStore();
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-0 overflow-y-auto bg-white ${isOver ? "bg-[#FF0080]/[0.03]" : ""}`}
    >
      <div className="max-w-[720px] mx-auto min-h-full py-8 px-4">
        {blocks.length === 0 ? (
          <div className="h-[400px] rounded-2xl border-2 border-dashed border-black/10 grid place-items-center text-center px-8">
            <div>
              <div className="font-bold opacity-60">Drag a block here to start building</div>
              <div className="text-[12px] opacity-40 mt-1">Pick from the library on the left</div>
            </div>
          </div>
        ) : (
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {blocks.map((block) => (
                <SortableBlock key={block.id} block={block} />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
