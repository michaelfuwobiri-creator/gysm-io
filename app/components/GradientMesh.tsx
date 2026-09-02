"use client";

// Soft, slowly-drifting gradient-mesh backdrop used behind a couple of
// "front door" prompt boxes (dashboard hero, builder empty state) --
// GYSM's own violet/fuchsia/amber accent colors (same palette as the
// gradient text already used across the site), not a copy of any
// specific product's exact gradient. Pure CSS, no canvas/JS work, and
// respects prefers-reduced-motion. Drop it in as the first child of a
// `relative overflow-hidden` container.
export default function GradientMesh() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="gysm-blob gysm-blob-a absolute -top-1/3 left-[8%] w-[60%] h-[140%] rounded-full bg-[#FF0080]/[0.14] blur-[90px]" />
        <div className="gysm-blob gysm-blob-b absolute -top-1/4 right-[4%] w-[50%] h-[130%] rounded-full bg-[#FF0080]/[0.14] blur-[90px]" />
        <div className="gysm-blob gysm-blob-c absolute top-0 left-[32%] w-[40%] h-[120%] rounded-full bg-amber-300/[0.10] blur-[90px]" />
      </div>
      <style
        // dangerouslySetInnerHTML, not JSX children -- React HTML-escapes
        // plain text children uniformly (turning e.g. a literal ' into
        // &#x27;), but <style> is a "raw text" element per the HTML spec:
        // browsers do NOT decode entities inside <style>/<script>, so any
        // escaped character ends up literally inside the applied CSS. That's
        // exactly what broke app/marketplace/MarketplaceClient.tsx's quoted
        // font-family values (see the fix there) and, separately, broke
        // Google Fonts site-wide via a mangled @import url(). This has no
        // quotes today, but dangerouslySetInnerHTML sets raw text with zero
        // escaping -- like Next's own pattern for the JSON-LD script in
        // app/layout.tsx -- so it can never regress into that bug class no
        // matter what CSS gets added here later.
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes gysm-drift-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(4%,-3%) scale(1.05)} }
        @keyframes gysm-drift-b { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-5%,3%) scale(1.04)} }
        @keyframes gysm-drift-c { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(2%,4%) scale(1.06)} }
        .gysm-blob-a{animation:gysm-drift-a 14s ease-in-out infinite}
        .gysm-blob-b{animation:gysm-drift-b 17s ease-in-out infinite}
        .gysm-blob-c{animation:gysm-drift-c 20s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){
          .gysm-blob-a,.gysm-blob-b,.gysm-blob-c{animation:none}
        }
      `,
        }}
      />
    </>
  );
}
