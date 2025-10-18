import type { Address } from "viem";
import { CHAIN_ID_SEPOLIA } from "./constants";

type BuildParams = {
  tokenAddress: Address;
  recipient: Address;
  amountWei?: bigint;
  chainId?: number;
};

export function buildEip681TransferUri({
  tokenAddress,
  recipient,
  amountWei,
  chainId = CHAIN_ID_SEPOLIA,
}: BuildParams): string {
  const pathChain = chainId ? `@${chainId}` : "";
  const base = `ethereum:${tokenAddress}${pathChain}/transfer`;

  const params = new URLSearchParams({
    address: recipient,
  });

  if (amountWei && amountWei > 0n) {
    params.set("uint256", amountWei.toString());
  }

  return `${base}?${params.toString()}`;
}
