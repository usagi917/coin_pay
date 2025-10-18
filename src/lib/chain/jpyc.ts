import type { Address } from "viem";
import { readContract } from "viem/actions";
import { formatUnits } from "viem";
import { publicClient } from "./client";
import { requireJpycContractAddress } from "./config";
import { JPYC_DECIMALS } from "./constants";

export const jpycAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export async function readJpycBalance(address: Address): Promise<bigint> {
  const contractAddress = requireJpycContractAddress();

  return readContract(publicClient, {
    address: contractAddress,
    abi: jpycAbi,
    functionName: "balanceOf",
    args: [address],
  });
}

export function formatJpycAmount(amountWei: bigint): string {
  const formatted = formatUnits(amountWei, JPYC_DECIMALS);
  const [integerPart, fractionalPart] = formatted.split(".");

  const integerValue =
    integerPart && integerPart !== "" ? BigInt(integerPart) : 0n;
  const formattedInteger = new Intl.NumberFormat("ja-JP").format(integerValue);

  if (!fractionalPart) {
    return formattedInteger;
  }

  const trimmedFraction = fractionalPart.replace(/0+$/, "").slice(0, 4);

  return trimmedFraction
    ? `${formattedInteger}.${trimmedFraction}`
    : formattedInteger;
}
