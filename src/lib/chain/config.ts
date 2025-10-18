import type { Address } from "viem";
import { sepolia } from "viem/chains";

export function getJpycContractAddress(): Address | null {
  const address = process.env.NEXT_PUBLIC_JPYC_ADDRESS;

  if (!address) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("NEXT_PUBLIC_JPYC_ADDRESS is not set.");
    }
    return null;
  }

  return address as Address;
}

export function requireJpycContractAddress(): Address {
  const address = getJpycContractAddress();
  if (!address) {
    throw new Error("JPYC コントラクトが未設定です");
  }
  return address;
}

export function getRpcUrl(): string {
  const envValue = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
  if (envValue && envValue.trim().length > 0) {
    return envValue;
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "NEXT_PUBLIC_SEPOLIA_RPC_URL is not set. Falling back to default Sepolia RPC URL."
    );
  }

  const fallback =
    sepolia.rpcUrls.default.http[0] ?? sepolia.rpcUrls.public.http[0];

  if (!fallback) {
    throw new Error("Sepolia RPC URL が見つかりませんでした");
  }

  return fallback;
}
