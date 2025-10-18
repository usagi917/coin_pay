export const ERC20_TRANSFER_GAS_LIMIT = 65_000n;

export function estimateErc20TransferFee(
  gasPriceWei: bigint,
  gasLimit: bigint = ERC20_TRANSFER_GAS_LIMIT
): bigint {
  return gasPriceWei * gasLimit;
}

export function isGasSufficient(
  nativeBalanceWei: bigint,
  requiredFeeWei: bigint,
  bufferWei: bigint = 0n
): boolean {
  return nativeBalanceWei >= requiredFeeWei + bufferWei;
}
