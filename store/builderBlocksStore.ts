"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createBlock, type BlockType, type BuilderBlock } from "@/lib/builderBlocks/blockDefs";

type BuilderBlocksState = {
  projectId: string | null;
  projectName: string;
  blocks: BuilderBlock[];
  selectedId: string | null;
  isDirty: boolean;
  // Whose draft this is. Not shown anywhere -- exists purely so
  // resetIfDifferentUser (below) can tell "my own draft from an earlier
  // visit" apart from "someone else's draft left behind in this browser's
  // localStorage" the first time a page mounts in a session.
  lastUserId: string | null;

  loadProject: (project: { id: string | null; name: string; blocks: BuilderBlock[] }) => void;
  setProjectName: (name: string) => void;
  addBlock: (type: BlockType, index?: number) => void;
  removeBlock: (id: string) => void;
  updateBlockProps: (id: string, props: Record<string, unknown>) => void;
  reorderBlocks: (activeId: string, overId: string) => void;
  selectBlock: (id: string | null) => void;
  markSaved: (projectId: string) => void;
  reset: () => void;
  // Bug fix: this store persists to localStorage (see the `persist` call
  // below), which is scoped per-browser, not per-account. On a shared or
  // public computer, one person's unsaved draft was silently visible to
  // whoever signed in next on that same browser. Call this once on mount
  // with the current signed-in user's id (see BuilderBlocksClient.tsx) --
  // it wipes the draft when it belonged to someone else, and leaves it
  // alone (so a real refresh/crash-recovery still works) when it's the
  // same person coming back.
  resetIfDifferentUser: (userId: string) => void;
};

// Zustand + persist -- the queue spec asked for exactly this combination
// (see GYSM_IO_HANDOFF.md's verbatim prompt for item #6). Persisting to
// localStorage here is a crash/refresh-safe autosave draft, separate from
// the explicit "Save" button in TopBar.tsx, which POSTs the same shape to
// /api/builder-blocks so it survives across devices/browsers, not just
// this one. On load, BuilderBlocksClient prefers a real saved project
// (from the server) over this local draft when both exist for the same id.
export const useBuilderBlocksStore = create<BuilderBlocksState>()(
  persist(
    (set) => ({
      projectId: null,
      projectName: "Untitled",
      blocks: [],
      selectedId: null,
      isDirty: false,
      lastUserId: null,

      loadProject: ({ id, name, blocks }) =>
        set({ projectId: id, projectName: name, blocks, selectedId: null, isDirty: false }),

      setProjectName: (name) => set({ projectName: name, isDirty: true }),

      addBlock: (type, index) =>
        set((s) => {
          const block = createBlock(type);
          const blocks = [...s.blocks];
          if (index === undefined || index >= blocks.length) blocks.push(block);
          else blocks.splice(index, 0, block);
          return { blocks, selectedId: block.id, isDirty: true };
        }),

      removeBlock: (id) =>
        set((s) => ({
          blocks: s.blocks.filter((b) => b.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
          isDirty: true,
        })),

      updateBlockProps: (id, props) =>
        set((s) => ({
          blocks: s.blocks.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...props } } : b)),
          isDirty: true,
        })),

      reorderBlocks: (activeId, overId) =>
        set((s) => {
          if (activeId === overId) return s;
          const blocks = [...s.blocks];
          const from = blocks.findIndex((b) => b.id === activeId);
          const to = blocks.findIndex((b) => b.id === overId);
          if (from === -1 || to === -1) return s;
          const [moved] = blocks.splice(from, 1);
          blocks.splice(to, 0, moved);
          return { blocks, isDirty: true };
        }),

      selectBlock: (id) => set({ selectedId: id }),

      markSaved: (projectId) => set({ projectId, isDirty: false }),

      reset: () => set({ projectId: null, projectName: "Untitled", blocks: [], selectedId: null, isDirty: false }),

      resetIfDifferentUser: (userId) =>
        set((s) => {
          if (s.lastUserId && s.lastUserId !== userId) {
            return { projectId: null, projectName: "Untitled", blocks: [], selectedId: null, isDirty: false, lastUserId: userId };
          }
          return { lastUserId: userId };
        }),
    }),
    {
      name: "gysm_builder_blocks_draft",
      partialize: (s) => ({ projectId: s.projectId, projectName: s.projectName, blocks: s.blocks, lastUserId: s.lastUserId }),
    }
  )
);
