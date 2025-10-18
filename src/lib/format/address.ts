export function shortenAddress(
  address: string,
  options?: { prefix?: number; suffix?: number }
) {
  const prefix = options?.prefix ?? 6;
  const suffix = options?.suffix ?? 4;

  if (!address || address.length <= prefix + suffix + 3) {
    return address;
  }

  return `${address.slice(0, prefix)}...${address.slice(-suffix)}`;
}
