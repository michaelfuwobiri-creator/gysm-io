// Previously fetched /api/projects?id=... and rendered the result via
// dangerouslySetInnerHTML directly into the page -- i.e. unsandboxed, in the
// real gysm.io origin, unlike every other place this app shows AI-generated
// HTML (builder/dashboard/templates all use a sandboxed iframe srcDoc). That
// API route is gone (see app/gang/page.tsx for why), so this could never
// resolve real content anyway. Left as a safe placeholder rather than wired
// back up -- if you want public share links back, the right shape is a
// Neon lookup by project id feeding a sandboxed iframe, same pattern as
// the dashboard, not a direct HTML injection into the parent page.
export default function PublishPage() {
  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold mb-2">Public sharing isn't live yet</h1>
        <p className="text-black/50 max-w-sm mx-auto">This page is being rebuilt. Check back soon.</p>
        <a href="/builder" className="mt-6 inline-block px-5 py-2 bg-black text-white rounded-full font-semibold text-sm hover:opacity-90 transition">
          Go to builder
        </a>
      </div>
    </div>
  );
}
