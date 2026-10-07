import { describe, expect, it } from "vitest";
import { scanForSecrets } from "../lib/secretScan";

const jwt = (payload: object) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.c2lnbmF0dXJlLXBhcnQtaGVyZQ`;
};

describe("scanForSecrets", () => {
  it("returns nothing for a clean page", () => {
    expect(scanForSecrets("<!DOCTYPE html><html><body><h1>Hello</h1></body></html>")).toEqual([]);
  });

  it("flags an Anthropic key once, not also as an OpenAI key", () => {
    const html = `<script>const k = "sk-ant-api03-${"a1B2".repeat(10)}";</script>`;
    const found = scanForSecrets(html);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("anthropic_key");
    expect(found[0].severity).toBe("high");
  });

  it("flags an OpenAI key", () => {
    const found = scanForSecrets(`fetch(url, {headers:{Authorization:"Bearer sk-proj-${"Xy9".repeat(14)}"}})`);
    expect(found.map((f) => f.kind)).toContain("openai_key");
  });

  it("flags Stripe secret keys and webhook secrets", () => {
    const found = scanForSecrets(`sk_live_${"4eC39HqLyjWDarjt".repeat(2)} whsec_${"abcd1234".repeat(4)}`);
    expect(found.map((f) => f.kind).sort()).toEqual(["stripe_secret", "stripe_webhook"]);
  });

  it("does not flag Stripe publishable keys", () => {
    expect(scanForSecrets(`const pk = "pk_live_${"4eC39HqLyjWDarjt".repeat(2)}";`)).toEqual([]);
  });

  it("flags AWS and GitHub credentials", () => {
    const found = scanForSecrets(`AKIAIOSFODNN7EXAMPLE ghp_${"a".repeat(36)}`);
    expect(found.map((f) => f.kind).sort()).toEqual(["aws_access_key", "github_token"]);
  });

  it("flags a private key block", () => {
    const found = scanForSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----");
    expect(found[0].kind).toBe("private_key");
  });

  it("flags a Supabase service_role JWT but not the public anon key", () => {
    const service = jwt({ iss: "supabase", role: "service_role" });
    const anon = jwt({ iss: "supabase", role: "anon" });
    expect(scanForSecrets(`const a = "${anon}";`)).toEqual([]);
    const found = scanForSecrets(`const s = "${service}";`);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("supabase_service_role");
  });

  it("flags a hard-coded secret assignment as 'review' and ignores placeholders", () => {
    const real = scanForSecrets(`const config = { apiKey: "r4nd0mT0kenValue1234567890" };`);
    expect(real).toHaveLength(1);
    expect(real[0].severity).toBe("review");
    expect(scanForSecrets(`const config = { apiKey: "YOUR_API_KEY_GOES_HERE_1234" };`)).toEqual([]);
    expect(scanForSecrets(`const config = { apiKey: "pk_test_abcdefghijklmnopqrstu" };`)).toEqual([]);
  });

  it("never returns the full secret and counts repeats", () => {
    const key = `sk_live_${"4eC39HqLyjWDarjt".repeat(2)}`;
    const found = scanForSecrets(`${key} and again ${key}`);
    expect(found).toHaveLength(1);
    expect(found[0].count).toBe(2);
    expect(found[0].preview).not.toContain(key);
    expect(found[0].preview.length).toBeLessThan(key.length);
  });

  it("lists high-severity findings before review ones", () => {
    const found = scanForSecrets(`token = "r4nd0mT0kenValue1234567890" AKIAIOSFODNN7EXAMPLE`.replace("token =", `{"authToken":`));
    expect(found[0].severity).toBe("high");
  });
});
