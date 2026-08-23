import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { getUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";

// Persistent left-sidebar shell for the signed-in app pages (dashboard,
// templates, connectors, buildguild). Modeled on the left-nav pattern
// common to AI-builder dashboards -- a fixed rail with icon'd nav items
// grouped into sections, an account identity row, and a plan/credits
// card pinned above the org switcher -- but built from GYSM's own light
// identity and real data (actual credit balance, actual user), not a
// copy of any specific product's markup or branding assets.
//
// `active` just picks which nav item gets the highlighted state -- each
// page passes its own key rather than this component trying to infer it
// from a client-side pathname hook.
//
// This is an async server component (calls getUser/getCreditBalance
// itself) so callers don't need to thread that data through -- every
// existing `<AppShell active="...">{children}</AppShell>` call site
// keeps working unchanged.
const NAV_GROUPS: {
  title: string;
  items: { key: string; label: string; href: string; icon: string }[];
}[] = [
  {
    title: "Workspace",
    items: [
      { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "grid" },
      { key: "templates", label: "Templates", href: "/templates", icon: "layout" },
      { key: "connectors", label: "Connectors", href: "/connectors", icon: "plug" },
      { key: "analytics", label: "Analytics", href: "/dashboard/analytics", icon: "chart" },
    ],
  },
  {
    title: "Community",
    items: [
      { key: "buildguild", label: "BuildGuild", href: "/buildguild", icon: "users" },
      { key: "roadmap", label: "Roadmap", href: "/roadmap", icon: "map" },
    ],
  },
  {
    title: "Account",
    items: [
      { key: "billing", label: "Billing", href: "/billing", icon: "card" },
      { key: "team", label: "Team", href: "/team", icon: "team" },
      { key: "api-keys", label: "API Keys", href: "/settings/api-keys", icon: "key" },
    ],
  },
];

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "grid") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (name === "layout") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    );
  }
  if (name === "plug") {
    return (
      <svg {...common}>
        <path d="M9 2v6" />
        <path d="M15 2v6" />
        <path d="M6 8h12v3a6 6 0 01-12 0V8z" />
        <path d="M12 17v5" />
      </svg>
    );
  }
  if (name === "map") {
    return (
      <svg {...common}>
        <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
        <path d="M9 4v14" />
        <path d="M15 6v14" />
      </svg>
    );
  }
  if (name === "card") {
    return (
      <svg {...common}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    );
  }
  if (name === "team") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.5 19c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" />
        <circle cx="18" cy="8.5" r="2.4" />
        <path d="M15.5 13.2c2.6.4 4.5 2.6 4.5 5.3" />
      </svg>
    );
  }
  if (name === "key") {
    return (
      <svg {...common}>
        <circle cx="7.5" cy="15.5" r="4.5" />
        <path d="M10.6 12.4L20 3" />
        <path d="M15 8l3 3" />
        <path d="M18 5l3 3" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg {...common}>
        <path d="M3 3v18h18" />
        <path d="M7 16l4-5 3 3 5-7" />
      </svg>
    );
  }
  // users / community
  return (
    <svg {...common}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" />
      <circle cx="18" cy="8.5" r="2.4" />
      <path d="M15.5 13.2c2.6.4 4.5 2.6 4.5 5.3" />
    </svg>
  );
}

export default async function AppShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  const user = await getUser();
  const credits = user ? await getCreditBalance(user.id) : 0;
  const displayName = user?.name || user?.email || "there";
  const initial = displayName.trim().charAt(0).toUpperCase() || "G";

  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] flex">
      <aside className="hidden md:flex w-60 shrink-0 flex-col justify-between border-r border-black/10 bg-white p-3 fixed inset-y-0 left-0 z-20">
        <div>
          <a href="/dashboard" className="flex items-center gap-2 px-2 py-3 mb-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-fuchsia-400 to-violet-500 grid place-items-center text-white font-black text-sm shrink-0">
              G
            </div>
            <span className="font-black tracking-tight">GYSM<span className="text-fuchsia-500">.IO</span></span>
          </a>

          {/* Identity row -- who's signed in, at a glance, above the nav
              (same spot a workspace switcher usually lives). */}
          <div className="flex items-center gap-2 px-2 py-2 mb-3 rounded-xl bg-black/[0.03]">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white text-[11px] font-black shrink-0">
              {initial}
            </div>
            <span className="text-[12px] font-semibold text-black/70 truncate">{displayName}</span>
          </div>

          <nav className="flex flex-col gap-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-black/30">
                  {group.title}
                </div>
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <a
                      key={item.key}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                        active === item.key
                          ? "bg-black/5 text-black"
                          : "text-black/50 hover:text-black hover:bg-black/[0.03]"
                      }`}
                    >
                      <NavIcon name={item.icon} />
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2">
          {/* Credits / plan card -- real balance, not a placeholder. */}
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-black/40">Credits</span>
              <span className="text-[13px] font-black">{credits}</span>
            </div>
            <a
              href="/pricing"
              className="text-[12px] font-bold text-center py-1.5 rounded-full bg-black text-white hover:opacity-90 transition"
            >
              Upgrade →
            </a>
          </div>
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/dashboard"
              afterSelectOrganizationUrl="/dashboard"
              afterSelectPersonalUrl="/dashboard"
              afterLeaveOrganizationUrl="/dashboard"
              appearance={{ elements: { organizationSwitcherTrigger: "text-black text-xs" } }}
            />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 md:ml-60">{children}</main>
    </div>
  );
}
