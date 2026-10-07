import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildLinkMessage,
  newNonce,
  normalizeAddress,
  resolveDomain,
  toChecksum,
  verifyWalletSignature,
  WALLET_CHAIN,
} from "../lib/wallet";

describe("resolveDomain", () => {
  it("accepts our hosts, with or without port and in any case", () => {
    expect(resolveDomain("www.gysm.io")).toBe("www.gysm.io");
    expect(resolveDomain("GYSM.AI")).toBe("gysm.ai");
    expect(resolveDomain("localhost:3000")).toBe("localhost");
  });
  it("rejects other hosts and empty input", () => {
    expect(resolveDomain("evil.example.com")).toBeNull();
    expect(resolveDomain("gysm.io.evil.com")).toBeNull();
    expect(resolveDomain(null)).toBeNull();
  });
});

describe("normalizeAddress", () => {
  const account = privateKeyToAccount(generatePrivateKey());
  it("lowercases a valid checksummed address", () => {
    expect(normalizeAddress(account.address)).toBe(account.address.toLowerCase());
  });
  it("rejects garbage, non-strings and bad checksums", () => {
    expect(normalizeAddress("0x123")).toBeNull();
    expect(normalizeAddress(42)).toBeNull();
    const bad = account.address.slice(0, 5) + (account.address[5] === "a" ? "A" : "a") + account.address.slice(6);
    // flipping a letter's case only breaks the checksum if that char is a letter
    if (/[a-fA-F]/.test(account.address[5]) && bad !== account.address) expect(normalizeAddress(bad)).toBeNull();
  });
});

describe("nonce and message", () => {
  it("generates distinct 32-char hex nonces", () => {
    const a = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce()).not.toBe(a);
  });

  it("builds a message that states it grants no spending permission", () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const msg = buildLinkMessage({
      domain: "www.gysm.io",
      address: account.address.toLowerCase(),
      nonce: "abc",
      issuedAt: new Date("2026-10-07T00:00:00Z"),
      expiresAt: new Date("2026-10-07T00:10:00Z"),
    });
    expect(msg).toContain("www.gysm.io wants you to link this wallet");
    expect(msg).toContain(account.address); // checksummed
    expect(msg).toContain("does not move funds or grant any spending permission");
    expect(msg).toContain(`Chain ID: ${WALLET_CHAIN.id}`);
    expect(msg).toContain("URI: https://www.gysm.io");
  });
});

describe("verifyWalletSignature", () => {
  it("accepts a valid EOA signature offline", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const message = "hello gysm";
    const signature = await account.signMessage({ message });
    expect(await verifyWalletSignature(account.address.toLowerCase(), message, signature)).toBe(true);
    expect(toChecksum(account.address.toLowerCase())).toBe(account.address);
  });

  it("rejects malformed signatures before any network call", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    expect(await verifyWalletSignature(account.address, "m", "not-hex")).toBe(false);
    expect(await verifyWalletSignature(account.address, "m", "0x" + "ab".repeat(10_001))).toBe(false);
  });
});
