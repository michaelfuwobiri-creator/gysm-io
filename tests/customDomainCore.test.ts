import { describe, expect, it } from "vitest";
import { cleanDomainInput, describeDnsRecords, dnsRecordsFor, domainProblem, isApexDomain } from "@/lib/customDomainCore";

describe("custom domain helpers", () => {
  it("cleans pasted URLs down to a host", () => {
    expect(cleanDomainInput("  https://MyApp.com/about?x=1 ")).toBe("myapp.com");
    expect(cleanDomainInput("www.myapp.com:443")).toBe("www.myapp.com");
    expect(cleanDomainInput("myapp.com.")).toBe("myapp.com");
  });
  it("accepts normal domains", () => {
    for (const d of ["myapp.com", "app.mydomain.com", "my-site.co.uk"]) expect(domainProblem(d)).toBeNull();
  });
  it.each(["", "nodot", "-bad.com", "bad-.com", "a b.com", "gysm.io", "www.gysm.io", "x.gysm.io", "foo.vercel.app", "1.2.3.4", "localhost", "a..com"])(
    "rejects %j",
    (d) => expect(domainProblem(d)).not.toBeNull(),
  );
  it("tells apex from subdomain", () => {
    expect(isApexDomain("myapp.com")).toBe(true);
    expect(isApexDomain("myapp.co.uk")).toBe(true);
    expect(isApexDomain("www.myapp.com")).toBe(false);
    expect(isApexDomain("app.myapp.co.uk")).toBe(false);
  });
  it("lists the right DNS records", () => {
    expect(dnsRecordsFor("myapp.com")[0]).toMatchObject({ type: "A", host: "@", value: "76.76.21.21" });
    expect(dnsRecordsFor("www.myapp.com")[0]).toMatchObject({ type: "CNAME", host: "www", value: "cname.vercel-dns.com" });
    const withTxt = dnsRecordsFor("myapp.com", [{ type: "TXT", domain: "_vercel.myapp.com", value: "vc-domain-verify=abc" }]);
    expect(withTxt).toHaveLength(2);
    expect(describeDnsRecords(withTxt)).toContain("vc-domain-verify=abc");
  });
});
