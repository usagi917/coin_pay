import type { Address, EIP1193Provider, WalletClient } from "viem";
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";
import { CHAIN_ID_SEPOLIA } from "./constants";

const SEPOLIA_CHAIN_ID_HEX = `0x${CHAIN_ID_SEPOLIA.toString(16)}` as const;

export function createSepoliaWalletClient(provider: EIP1193Provider) {
  return createWalletClient({
    chain: sepolia,
    transport: custom(provider),
  });
}

export async function ensureSepoliaChain(
  walletClient: WalletClient
): Promise<void> {
  const chainId = await walletClient.getChainId();
  if (chainId !== CHAIN_ID_SEPOLIA) {
    throw new Error("Sepolia に接続してから再度お試しください");
  }
}

async function switchToSepoliaChain(provider: EIP1193Provider): Promise<void> {
  if (!provider.request) {
    throw new Error("ウォレットが見つかりませんでした");
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
    return;
  } catch (error) {
    const code = (error as { code?: number | string }).code;
    if (code === 4902 || code === "4902") {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: "Sepolia",
            nativeCurrency: {
              name: "Sepolia Ether",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: sepolia.rpcUrls.default.http,
            blockExplorerUrls: sepolia.blockExplorers?.default?.url
              ? [sepolia.blockExplorers.default.url]
              : undefined,
          },
        ],
      });

      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
      return;
    }

    throw error;
  }
}

export async function requestWalletAccount(
  provider: EIP1193Provider
): Promise<Address> {
  if (!provider.request) {
    throw new Error("ウォレットが見つかりませんでした");
  }

  const response = await provider.request({
    method: "eth_requestAccounts",
  });

  if (!Array.isArray(response) || response.length === 0) {
    throw new Error("ウォレットが接続されていません");
  }

  const [account] = response as Address[];

  const walletClient = createSepoliaWalletClient(provider);
  try {
    await ensureSepoliaChain(walletClient);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Sepolia")) {
      await switchToSepoliaChain(provider);
      await ensureSepoliaChain(walletClient);
    } else {
      throw error;
    }
  }

  return account;
}

export async function getPrimaryAccount(
  walletClient: WalletClient
): Promise<Address> {
  const [account] = await walletClient.getAddresses();

  if (!account) {
    throw new Error("ウォレットが接続されていません");
  }

  return account;
}
