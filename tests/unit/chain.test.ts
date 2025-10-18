import { describe, it, expect, vi, afterEach } from "vitest";
import { sepolia } from "viem/chains";
import type { Address, WalletClient, Hash } from "viem";

vi.mock("viem/actions", () => ({
  readContract: vi.fn(),
}));

import {
  getJpycContractAddress,
  requireJpycContractAddress,
  getRpcUrl,
} from "../../src/lib/chain/config";
import { buildEip681TransferUri } from "../../src/lib/chain/eip681";
import {
  estimateErc20TransferFee,
  isGasSufficient,
  ERC20_TRANSFER_GAS_LIMIT,
} from "../../src/lib/chain/gas";
import { formatJpycAmount, readJpycBalance } from "../../src/lib/chain/jpyc";
import {
  ensureSepoliaChain,
  getPrimaryAccount,
} from "../../src/lib/chain/wallet";
import { transferJpyc } from "../../src/lib/chain/transfer";
import { CHAIN_ID_SEPOLIA } from "../../src/lib/chain/constants";
import { readContract } from "viem/actions";

const originalJpycAddress = process.env.NEXT_PUBLIC_JPYC_ADDRESS;
const originalRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

const SAMPLE_JPYC_ADDRESS =
  "0x0000000000000000000000000000000000000AAA" as Address;
const SAMPLE_RECIPIENT =
  "0x0000000000000000000000000000000000000BBB" as Address;
const SAMPLE_SENDER = "0x0000000000000000000000000000000000000CCC" as Address;

afterEach(() => {
  process.env.NEXT_PUBLIC_JPYC_ADDRESS = originalJpycAddress;
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL = originalRpcUrl;
  vi.clearAllMocks();
});

describe("chain/config", () => {
  it("returns contract address when env is set", () => {
    process.env.NEXT_PUBLIC_JPYC_ADDRESS = SAMPLE_JPYC_ADDRESS;

    const result = getJpycContractAddress();

    expect(result).toBe(SAMPLE_JPYC_ADDRESS);
  });

  it("returns null and warns when contract address is missing", () => {
    delete process.env.NEXT_PUBLIC_JPYC_ADDRESS;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = getJpycContractAddress();

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "NEXT_PUBLIC_JPYC_ADDRESS is not set."
    );
    warnSpy.mockRestore();
  });

  it("throws when contract address is required but missing", () => {
    delete process.env.NEXT_PUBLIC_JPYC_ADDRESS;

    expect(() => requireJpycContractAddress()).toThrowError(
      "JPYC コントラクトが未設定です"
    );
  });

  it("returns RPC URL from env when provided", () => {
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL = "https://custom-rpc.example";

    expect(getRpcUrl()).toBe("https://custom-rpc.example");
  });

  it("falls back to Sepolia default RPC URL when env is blank", () => {
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL = "   ";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = getRpcUrl();

    expect(result).toBe(
      sepolia.rpcUrls.default.http[0] ?? sepolia.rpcUrls.public.http[0]
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "NEXT_PUBLIC_SEPOLIA_RPC_URL is not set. Falling back to default Sepolia RPC URL."
    );
    warnSpy.mockRestore();
  });
});

describe("chain/eip681", () => {
  it("builds URI without amount when omitted", () => {
    const uri = buildEip681TransferUri({
      tokenAddress: SAMPLE_JPYC_ADDRESS,
      recipient: SAMPLE_RECIPIENT,
    });

    expect(uri).toBe(
      `ethereum:${SAMPLE_JPYC_ADDRESS}@${CHAIN_ID_SEPOLIA}/transfer?address=${SAMPLE_RECIPIENT}`
    );
  });

  it("includes amount when greater than zero", () => {
    const amount = 123_000_000_000_000_000n;

    const uri = buildEip681TransferUri({
      tokenAddress: SAMPLE_JPYC_ADDRESS,
      recipient: SAMPLE_RECIPIENT,
      amountWei: amount,
    });

    expect(uri).toBe(
      `ethereum:${SAMPLE_JPYC_ADDRESS}@${CHAIN_ID_SEPOLIA}/transfer?address=${SAMPLE_RECIPIENT}&uint256=${amount.toString()}`
    );
  });

  it("omits amount when it is zero", () => {
    const uri = buildEip681TransferUri({
      tokenAddress: SAMPLE_JPYC_ADDRESS,
      recipient: SAMPLE_RECIPIENT,
      amountWei: 0n,
    });

    expect(uri).toBe(
      `ethereum:${SAMPLE_JPYC_ADDRESS}@${CHAIN_ID_SEPOLIA}/transfer?address=${SAMPLE_RECIPIENT}`
    );
  });

  it("allows overriding chain id", () => {
    const uri = buildEip681TransferUri({
      tokenAddress: SAMPLE_JPYC_ADDRESS,
      recipient: SAMPLE_RECIPIENT,
      chainId: 1,
    });

    expect(uri).toBe(
      `ethereum:${SAMPLE_JPYC_ADDRESS}@1/transfer?address=${SAMPLE_RECIPIENT}`
    );
  });
});

describe("chain/gas", () => {
  it("estimates ERC20 transfer fee with default gas limit", () => {
    const gasPrice = 2_000_000_000n;

    expect(estimateErc20TransferFee(gasPrice)).toBe(
      gasPrice * ERC20_TRANSFER_GAS_LIMIT
    );
  });

  it("estimates ERC20 transfer fee with custom gas limit", () => {
    const gasPrice = 3_000_000_000n;
    const customLimit = 70_000n;

    expect(estimateErc20TransferFee(gasPrice, customLimit)).toBe(
      gasPrice * customLimit
    );
  });

  it("returns true when gas balance covers required fee plus buffer", () => {
    const gasBalance = 100n;
    const required = 80n;
    const buffer = 10n;

    expect(isGasSufficient(gasBalance, required, buffer)).toBe(true);
  });

  it("returns false when gas balance is insufficient including buffer", () => {
    const gasBalance = 90n;
    const required = 80n;
    const buffer = 15n;

    expect(isGasSufficient(gasBalance, required, buffer)).toBe(false);
  });
});

describe("chain/jpyc", () => {
  it("formats JPYC amount with thousand separators and trimmed fraction", () => {
    const amount = 1_234_567_890_000_000_000_000n;

    expect(formatJpycAmount(amount)).toBe("1,234.5678");
  });

  it("formats whole number amounts without decimals", () => {
    const amount = 1_000_000_000_000_000_000n;

    expect(formatJpycAmount(amount)).toBe("1");
  });

  it("preserves leading zeros in fractional part up to four digits", () => {
    const amount = 1_000_000_000_000_000n;

    expect(formatJpycAmount(amount)).toBe("0.001");
  });

  it("reads JPYC balance using configured contract address", async () => {
    process.env.NEXT_PUBLIC_JPYC_ADDRESS = SAMPLE_JPYC_ADDRESS;
    const readContractMock = readContract as unknown as vi.Mock;
    readContractMock.mockResolvedValueOnce(123n);

    const balance = await readJpycBalance(SAMPLE_RECIPIENT);

    expect(balance).toBe(123n);
    expect(readContractMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        address: SAMPLE_JPYC_ADDRESS,
        functionName: "balanceOf",
        args: [SAMPLE_RECIPIENT],
      })
    );
  });
});

describe("chain/wallet", () => {
  it("resolves when wallet client is already on Sepolia", async () => {
    const walletClient = {
      getChainId: vi.fn().mockResolvedValue(CHAIN_ID_SEPOLIA),
    } as unknown as WalletClient;

    await expect(ensureSepoliaChain(walletClient)).resolves.toBeUndefined();
  });

  it("throws when wallet client is on a different chain", async () => {
    const walletClient = {
      getChainId: vi.fn().mockResolvedValue(1),
    } as unknown as WalletClient;

    await expect(ensureSepoliaChain(walletClient)).rejects.toThrow(
      "Sepolia に接続してから再度お試しください"
    );
  });

  it("returns first account when available", async () => {
    const walletClient = {
      getAddresses: vi.fn().mockResolvedValue([SAMPLE_SENDER]),
    } as unknown as WalletClient;

    await expect(getPrimaryAccount(walletClient)).resolves.toBe(SAMPLE_SENDER);
  });

  it("throws when wallet client has no accounts", async () => {
    const walletClient = {
      getAddresses: vi.fn().mockResolvedValue([]),
    } as unknown as WalletClient;

    await expect(getPrimaryAccount(walletClient)).rejects.toThrow(
      "ウォレットが接続されていません"
    );
  });
});

describe("chain/transfer", () => {
  it("calls wallet client writeContract with JPYC transfer parameters", async () => {
    process.env.NEXT_PUBLIC_JPYC_ADDRESS = SAMPLE_JPYC_ADDRESS;
    const writeContract = vi.fn().mockResolvedValue("0x123" as Hash);
    const walletClient = {
      writeContract,
    } as unknown as WalletClient;

    const result = await transferJpyc({
      walletClient,
      sender: SAMPLE_SENDER,
      recipient: SAMPLE_RECIPIENT,
      amountWei: 500n,
    });

    expect(result).toBe("0x123");
    expect(writeContract).toHaveBeenCalledWith({
      address: SAMPLE_JPYC_ADDRESS,
      abi: expect.any(Array),
      functionName: "transfer",
      args: [SAMPLE_RECIPIENT, 500n],
      account: SAMPLE_SENDER,
    });
  });

  it("requires JPYC contract address before transfer", async () => {
    delete process.env.NEXT_PUBLIC_JPYC_ADDRESS;
    const writeContract = vi.fn();
    const walletClient = {
      writeContract,
    } as unknown as WalletClient;

    await expect(
      transferJpyc({
        walletClient,
        sender: SAMPLE_SENDER,
        recipient: SAMPLE_RECIPIENT,
        amountWei: 500n,
      })
    ).rejects.toThrow("JPYC コントラクトが未設定です");
    expect(writeContract).not.toHaveBeenCalled();
  });
});
