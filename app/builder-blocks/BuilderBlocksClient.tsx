"use client";

import { useEffect } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useBuilderBlocksStore } from "@/store/builderBlocksStore";
import type { BlockType, BuilderBlock } from "@/lib/builderBlocks/blockDefs";
import BlockLibrary from "@/components/builder-blocks/BlockLibrary";
import BuilderCanvas from "@/components/builder-blocks/BuilderCanvas";
import PropsPanel from "@/components/builder-blocks/PropsPanel";
import TopBar from "@/components/builder-blocks/TopBar";

export default function BuilderBlocksClient({
  initialProject,
  userId,
}: {
  initialProject: { id: string; name: string; blocks: BuilderBlock[] } | null;
  userId: string;
}) {
  const { blocks, addBlock, reorderBlocks, loadProject, resetIfDifferentUser } = useBuilderBlocksStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Bug fix: the draft below persists to this browser's localStorage, not
  // to this account -- on a shared/public computer, whoever signs in next
  // would otherwise inherit the previous person's unsaved blocks. Wipes
  // the draft when it belonged to a different signed-in user; leaves it
  // alone for the same user coming back (that's the actual point of
  // persisting it -- see store/builderBlocksStore.ts). Deliberately runs
  // BEFORE the initialProject effect below, so a stale cross-account
  // draft never has a chance to render even for a frame.
  useEffect(() => {
    resetIfDifferentUser(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // A server-loaded project (came in via ?id=, see page.tsx) always wins
  // over whatever's sitting in the localStorage draft -- opening a saved
  // project should show that project, not an unrelated in-progress draft
  // from a different tab. Runs once per project id.
  useEffect(() => {
    if (initialProject) {
      loadProject(initialProject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProject?.id]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as { source?: string; type?: BlockType } | undefined;

    if (activeData?.source === "library" && activeData.type) {
      // New block dropped in from the palette. Dropped onto another
      // block -> insert at that block's position; dropped onto the bare
      // canvas (empty state, or the padding around the list) -> append.
      const overIndex = blocks.findIndex((b) => b.id === over.id);
      addBlock(activeData.type, overIndex === -1 ? undefined : overIndex);
      return;
    }

    // Otherwise this is a reorder of two blocks already on the canvas.
    if (active.id !== over.id && typeof active.id === "string" && typeof over.id === "string") {
      reorderBlocks(active.id, over.id);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#FCFCF9] text-[#0A0A0A]">
      <TopBar />
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex min-h-0">
          <BlockLibrary />
          <BuilderCanvas />
          <PropsPanel />
        </div>
      </DndContext>
    </div>
  );
}
