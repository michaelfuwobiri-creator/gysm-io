import { redirect } from "next/navigation";
import { OrganizationProfile, CreateOrganization } from "@clerk/nextjs";
import { getUser } from "@/lib/auth";
import AppShell from "@/app/components/AppShell";

export const metadata = { title: "Team | GYSM.IO" };

// Full team management -- invite by email, assign roles, remove members,
// see pending invitations. Clerk's <OrganizationProfile /> is a complete,
// pre-built UI for exactly this (same family of component as the
// <OrganizationSwitcher /> already used in AppShell.tsx to create/switch
// orgs) -- Clerk already owns org membership as a first-class concept, so
// this is real functionality, not a stub, without GYSM needing its own
// invite-email pipeline or roles table.
export default async function TeamPage() {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/team");
  }

  return (
    <AppShell active="team">
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <h1 className="text-2xl font-black tracking-tight mb-1">Team</h1>
        <p className="text-[13px] text-black/40 mb-8">
          Invite teammates, manage roles, or start a new organization to collaborate on builds.
        </p>

        {user.orgId ? (
          <OrganizationProfile
            routing="hash"
            appearance={{ elements: { rootBox: "w-full", cardBox: "w-full shadow-none border border-black/10 rounded-2xl" } }}
          />
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white p-6">
            <p className="text-[14px] text-black/60 mb-5">
              You're on a personal workspace right now. Create an organization to invite teammates and share
              builds with them.
            </p>
            <CreateOrganization
              routing="hash"
              afterCreateOrganizationUrl="/team"
              appearance={{ elements: { rootBox: "w-full", cardBox: "w-full shadow-none border border-black/10 rounded-2xl" } }}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
