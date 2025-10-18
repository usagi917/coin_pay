import type { Address, Hash, WalletClient } from "viem";
import { jpycAbi } from "./jpyc";
import { requireJpycContractAddress } from "./config";

type TransferParams = {
  walletClient: WalletClient;
  sender: Address;
  recipient: Address;
  amountWei: bigint;
};

export async function transferJpyc({
  walletClient,
  sender,
  recipient,
  amountWei,
}: TransferParams): Promise<Hash> {
  const contractAddress = requireJpycContractAddress();

  return walletClient.writeContract({
    address: contractAddress,
    abi: jpycAbi,
    functionName: "transfer",
    args: [recipient, amountWei],
    account: sender,
  });
}
