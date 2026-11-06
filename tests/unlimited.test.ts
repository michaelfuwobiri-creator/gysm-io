import { afterEach, describe, expect, it, vi } from "vitest";
const getUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser } }) }));
const sqlMock = vi.fn(async () => [{ balance: 42 }]);
vi.mock("@/lib/db", () => ({ sql: (...a: any[]) => (sqlMock as any)(...a) }));
import { chargeCredits, deductCredit, getCreditBalance } from "@/lib/credits";
import { formatCredits, UNLIMITED_BALANCE } from "@/lib/credits-constants";

const email = (addr: string, status = "verified") => ({ emailAddress: addr, verification: { status } });

afterEach(() => {
  getUser.mockReset();
  sqlMock.mockClear();
  vi.unstubAllEnvs();
});

describe("unlimited accounts", () => {
  it("never charges the admin (verified email)", async () => {
    getUser.mockResolvedValue({ emailAddresses: [email("michaelfuwobiri@gmail.com")] });
    expect(await getCreditBalance("u_admin")).toBe(UNLIMITED_BALANCE);
    expect(await deductCredit("u_admin", 500)).toBe(true);
    expect(await chargeCredits("u_admin", 900)).toBe(UNLIMITED_BALANCE);
    expect(sqlMock).not.toHaveBeenCalled();
  });
  it("ignores an unverified admin email", async () => {
    getUser.mockResolvedValue({ emailAddresses: [email("michaelfuwobiri@gmail.com", "unverified")] });
    expect(await getCreditBalance("u_fake")).toBe(42);
  });
  it("charges everyone else as normal", async () => {
    getUser.mockResolvedValue({ emailAddresses: [email("someone@example.com")] });
    expect(await getCreditBalance("u_other")).toBe(42);
    expect(sqlMock).toHaveBeenCalled();
  });
  it("accepts ids from UNLIMITED_USER_IDS and falls back safely when Clerk fails", async () => {
    vi.stubEnv("UNLIMITED_USER_IDS", "user_a, user_b");
    expect(await getCreditBalance("user_b")).toBe(UNLIMITED_BALANCE);
    getUser.mockRejectedValue(new Error("down"));
    expect(await getCreditBalance("u_down")).toBe(42);
  });
  it("shows Unlimited in the UI", () => {
    expect(formatCredits(UNLIMITED_BALANCE)).toBe("Unlimited");
    expect(formatCredits(120)).toBe("120");
  });
});
