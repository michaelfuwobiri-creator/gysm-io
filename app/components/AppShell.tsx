import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";

// Persistent left-sidebar shell for the signed-in app pages (dashboard,
// templates, connectors). Modeled on the left-nav pattern common to
// AI-builder dashboards (a fixed rail with Dashboard/Templates/Connectors
// plus workspace switcher and account menu pinned to the bottom) but
// built from GYSM's own dark violet/fuchsia identity (see app/page.tsx)
// rather than copying anyone's actual markup or branding assets.
//
// `active` just picks which nav item gets the highlighted state -- each
// page passes its own key rather than this component trying to infer it
// from a client-side pathname hook, so it stays a plain server component
// and every page keeps rendering instantly on first load.
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "templates", label: "Templates", href: "/templates" },
  { key: "connectors", label: "Connectors", href: "/connectors" },
  { key: "buildguild", label: "BuildGuild", href: "/buildguild" },
];

export default function AppShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white flex">
      <aside className="hidden md:flex w-60 shrink-0 flex-col justify-between border-r border-white/10 bg-black/60 p-3 fixed inset-y-0 left-0 z-20">
        <div>
          <a href="/dashboard" className="flex items-center gap-2 px-2 py-3 mb-4">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-fuchsia-400 to-violet-500 grid place-items-center text-white font-black text-sm shrink-0">
              G
            </div>
            <span className="font-black tracking-tight">GYSM.IO</span>
          </a>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.key}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  active === item.key
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            afterSelectPersonalUrl="/dashboard"
            afterLeaveOrganizationUrl="/dashboard"
            appearance={{ elements: { organizationSwitcherTrigger: "text-white text-xs" } }}
          />
          <UserButton afterSignOutUrl="/" />
        </div>
      </aside>
      <main className="flex-1 min-w-0 md:ml-60">{children}</main>
    </div>
  );
}
