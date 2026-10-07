import { randomBytes } from "crypto";
import { createPublicClient, getAddress, http, isAddress, verifyMessage, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";

// Non-custodial wallet linking. The user's wallet signs a one-time,
// server-built message (EIP-4361 "Sign in with Ethereum" shape). We store
// only the public address. We never see, generate or store a private key.
//
// Phase 0 runs on Base Sepolia (test network). Set NEXT_PUBLIC_WALLET_CHAIN=base
// when GSM is on mainnet. The chain only matters for (a) the Chain ID line in
// the message and (b) validating smart-contract wallets, which must be checked
// against the chain they live on.

export const WALLET_CHAIN =
  process.env.NEXT_PUBLIC_WALLET_CHAIN === "base" ? base : baseSepolia;

export const MAX_WALLETS_PER_USER = 5;
export const NONCE_TTL_MINUTES = 10;

const ALLOWED_DOMAINS = new Set([
  "gysm.io",
  "www.gysm.io",
  "gysm.ai",
  "www.gysm.ai",
  "localhost",
  "127.0.0.1",
]);

/** Host the user is on, if it is one of ours. Otherwise null (reject). */
export function resolveDomain(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.toLowerCase().split(":")[0];
  return ALLOWED_DOMAINS.has(host) ? host : null;
}

/** Lowercase address if valid, else null. Accepts any case, rejects bad checksums. */
export function normalizeAddress(input: unknown): string | null {
  if (typeof input !== "string") return null;
  // strict: true rejects a mixed-case address whose checksum is wrong.
  if (!isAddress(input, { strict: true })) return null;
  return input.toLowerCase();
}

export function toChecksum(lowerAddress: string): string {
  return getAddress(lowerAddress);
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

export function buildLinkMessage(params: {
  domain: string;
  address: string; // lowercase ok, shown checksummed
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  const local = params.domain === "localhost" || params.domain === "127.0.0.1";
  const uri = `${local ? "http" : "https"}://${params.domain}`;
  return [
    `${params.domain} wants you to link this wallet to your GYSM account:`,
    toChecksum(params.address),
    "",
    "Link this wallet to your GYSM account. This does not move funds or grant any spending permission.",
    "",
    `URI: ${uri}`,
    "Version: 1",
    `Chain ID: ${WALLET_CHAIN.id}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt.toISOString()}`,
    `Expiration Time: ${params.expiresAt.toISOString()}`,
  ].join("\n");
}

/**
 * True only if `signature` is a valid signature of `message` by `address`.
 * Plain wallets (EOAs) are checked offline. If that fails, we ask the chain,
 * which covers smart-contract wallets (ERC-1271, and ERC-6492 for wallets not
 * yet deployed), e.g. Coinbase Smart Wallet.
 */
export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]+$/.test(signature) || signature.length > 20_000) return false;
  const addr = toChecksum(address) as Hex;
  const sig = signature as Hex;

  try {
    if (await verifyMessage({ address: addr, message, signature: sig })) return true;
  } catch {
    /* fall through to on-chain check */
  }

  try {
    const client = createPublicClient({
      chain: WALLET_CHAIN,
      transport: http(process.env.WALLET_RPC_URL || undefined),
    });
    return await client.verifyMessage({ address: addr, message, signature: sig });
  } catch {
    return false;
  }
}
