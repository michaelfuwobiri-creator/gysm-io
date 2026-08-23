"use client";

import { useState } from "react";

type Props = {
  projectId: string;
};

// "Voiie" -- exports this build as a Vercel-ready folder (index.html +
// vercel.json, see app/api/projects/[id]/vercel-export) and opens
// vercel.com/new so the two windows are ready side by side: download
// finishes, unzip, drag the folder onto the tab that just opened. Vercel
// deploys it straight to the user's own account -- GYSM never touches
// their Vercel login, no OAuth integration needed for this to be real.
export default function DeployVercelButton({ projectId }: Props) {
  const [clicked, setClicked] = useState(false);

  function handleClick() {
    setClicked(true);
    window.location.href = `/api/projects/${projectId}/vercel-export`;
    window.open("https://vercel.com/new", "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex-1">
      <button
        onClick={handleClick}
        className="w-full text-center px-3 py-2 rounded-lg border border-black/10 text-xs font-bold hover:bg-black/[0.03]"
      >
        Deploy to Vercel
      </button>
      {clicked && (
        <p className="mt-1 text-[11px] text-black/40">
          Downloading your project -- unzip it, then drag the folder onto the Vercel tab that just opened.
        </p>
      )}
    </div>
  );
}
