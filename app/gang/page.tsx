// This page previously called GET/PATCH /api/projects (a like-and-browse
// community feed) which read/wrote the Prisma/Neon database. That database
// and API route have been removed in this pass -- it was a second, parallel
// data layer disconnected from the main database (see the dashboard/templates fixes),
// and its POST handler accepted a raw client-supplied userId with zero
// verification. This page is not linked from anywhere in the app right now,
// so nothing currently sends users here.
//
// Left as an honest placeholder rather than rebuilt: turning this into a
// real, Neon-backed community feed (likes, public authorship, etc.) is
// new feature work, not a fix to something existing, so it's your call --
// tell me if you want it rebuilt on Neon or removed outright.
export default function GangPage() {
  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold mb-2">Community feed isn't live yet</h1>
        <p className="text-black/50 max-w-sm mx-auto">This page is being rebuilt. Check back soon.</p>
        <a href="/builder" className="mt-6 inline-block px-5 py-2 bg-black text-white rounded-full font-semibold text-sm hover:opacity-90 transition">
          Go to builder
        </a>
      </div>
    </div>
  );
}
