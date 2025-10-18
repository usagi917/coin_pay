import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { getRpcUrl } from "./config";

const rpcUrl = getRpcUrl();

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});
