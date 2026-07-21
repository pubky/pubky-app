/**
 * Network utility functions for security and validation.
 */

type IPv4Range = { base: number; prefix: number };
type IPv6Range = { base: bigint; prefix: number };

const IPV4_OCTET_COUNT = 4;
const IPV6_PART_COUNT = 8;
const IPV6_PART_BASE = BigInt(0x10000);
const IPV4_PART_BASE = 256;

const UNSAFE_IPV4_RANGES: IPv4Range[] = [
  { base: ipv4Base(0), prefix: 8 }, // Current network / "this host on this network"
  { base: ipv4Base(10), prefix: 8 }, // Private-use
  { base: ipv4Base(100, 64), prefix: 10 }, // Carrier-grade NAT
  { base: ipv4Base(127), prefix: 8 }, // Loopback
  { base: ipv4Base(169, 254), prefix: 16 }, // Link-local
  { base: ipv4Base(172, 16), prefix: 12 }, // Private-use
  { base: ipv4Base(192, 0, 0), prefix: 24 }, // IETF protocol assignments
  { base: ipv4Base(192, 0, 2), prefix: 24 }, // Documentation
  { base: ipv4Base(192, 88, 99), prefix: 24 }, // Deprecated 6to4 relay anycast
  { base: ipv4Base(192, 168), prefix: 16 }, // Private-use
  { base: ipv4Base(198, 18), prefix: 15 }, // Benchmarking
  { base: ipv4Base(198, 51, 100), prefix: 24 }, // Documentation
  { base: ipv4Base(203, 0, 113), prefix: 24 }, // Documentation
  { base: ipv4Base(224), prefix: 4 }, // Multicast
  { base: ipv4Base(240), prefix: 4 }, // Reserved, includes limited broadcast
];

// More-specific globally reachable allocations override their special-purpose parent range.
const GLOBAL_IPV4_EXCEPTIONS: IPv4Range[] = [
  { base: ipv4Base(192, 0, 0, 9), prefix: 32 }, // Port Control Protocol anycast
  { base: ipv4Base(192, 0, 0, 10), prefix: 32 }, // TURN anycast
];

const UNSAFE_IPV6_RANGES: IPv6Range[] = [
  { base: ipv6Base(), prefix: 128 }, // Unspecified
  { base: ipv6Base(0, 0, 0, 0, 0, 0, 0, 1), prefix: 128 }, // Loopback
  { base: ipv6Base(0, 0, 0, 0, 0, 0xffff), prefix: 96 }, // IPv4-mapped IPv6
  // Intentionally block the globally reachable NAT64 prefix: embedded IPv4 destinations
  // could otherwise bypass the IPv4 safety policy at a network translator.
  { base: ipv6Base(0x64, 0xff9b), prefix: 96 },
  { base: ipv6Base(0x64, 0xff9b, 1), prefix: 48 }, // Local-use IPv4/IPv6 translation
  { base: ipv6Base(0x100), prefix: 64 }, // Discard-only
  { base: ipv6Base(0x2001), prefix: 23 }, // IETF protocol assignments
  { base: ipv6Base(0x2001, 0x0db8), prefix: 32 }, // Documentation
  { base: ipv6Base(0x2002), prefix: 16 }, // 6to4
  { base: ipv6Base(0x3fff), prefix: 20 }, // Documentation
  { base: ipv6Base(0xfc00), prefix: 7 }, // Unique local
  { base: ipv6Base(0xfe80), prefix: 10 }, // Link-local
  { base: ipv6Base(0xfec0), prefix: 10 }, // Deprecated site-local
  { base: ipv6Base(0xff00), prefix: 8 }, // Multicast
];

// More-specific globally reachable allocations override 2001::/23.
const GLOBAL_IPV6_EXCEPTIONS: IPv6Range[] = [
  { base: ipv6Base(0x2001, 0x0001, 0, 0, 0, 0, 0, 1), prefix: 128 }, // PCP anycast
  { base: ipv6Base(0x2001, 0x0001, 0, 0, 0, 0, 0, 2), prefix: 128 }, // TURN anycast
  { base: ipv6Base(0x2001, 0x0001, 0, 0, 0, 0, 0, 3), prefix: 128 }, // DNS-SD anycast
  { base: ipv6Base(0x2001, 0x0003), prefix: 32 }, // Automatic Multicast Tunneling
  { base: ipv6Base(0x2001, 0x0004, 0x0112), prefix: 48 }, // AS112-v6
  { base: ipv6Base(0x2001, 0x0020), prefix: 28 }, // ORCHIDv2
  { base: ipv6Base(0x2001, 0x0030), prefix: 28 }, // Drone Remote ID protocol entity tags
];

const GLOBAL_IPV6_RANGES: IPv6Range[] = [
  { base: ipv6Base(0x2000), prefix: 3 }, // Current IPv6 global unicast allocation
];

/**
 * Validates if an IP address is safe for server-side fetching.
 *
 * @security SSRF Prevention
 * This function is intentionally fail-closed: malformed input and non-global
 * IPv4/IPv6 ranges are considered unsafe.
 */
export function isIpSafe(ip: string): boolean {
  const normalizedIp = normalizeIpInput(ip);
  if (!normalizedIp) return false;

  const ipv4 = parseIpv4(normalizedIp);
  if (ipv4 !== null) {
    if (GLOBAL_IPV4_EXCEPTIONS.some((range) => isIpv4InRange(ipv4, range))) return true;
    return !UNSAFE_IPV4_RANGES.some((range) => isIpv4InRange(ipv4, range));
  }

  const ipv6 = parseIpv6(normalizedIp);
  if (ipv6 !== null) {
    if (GLOBAL_IPV6_EXCEPTIONS.some((range) => isIpv6InRange(ipv6, range))) return true;
    return (
      GLOBAL_IPV6_RANGES.some((range) => isIpv6InRange(ipv6, range)) &&
      !UNSAFE_IPV6_RANGES.some((range) => isIpv6InRange(ipv6, range))
    );
  }

  return false;
}

function normalizeIpInput(ip: string): string | null {
  if (!ip || ip.trim() !== ip) return null;

  const lowerIp = ip.toLowerCase();
  if (lowerIp.startsWith('[') || lowerIp.endsWith(']')) {
    if (!lowerIp.startsWith('[') || !lowerIp.endsWith(']')) return null;
    return lowerIp.slice(1, -1);
  }

  return lowerIp;
}

function parseIpv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== IPV4_OCTET_COUNT) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;

    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;

    value = value * IPV4_PART_BASE + octet;
  }

  return value;
}

function parseIpv6(ip: string): bigint | null {
  if (!ip.includes(':') || ip.includes('%')) return null;

  const ipv4Suffix = parseIpv4Suffix(ip);
  const normalizedIp = ipv4Suffix ? `${ipv4Suffix.prefix}:${ipv4Suffix.high}:${ipv4Suffix.low}` : ip;
  const halves = normalizedIp.split('::');
  if (halves.length > 2) return null;

  const left = parseIpv6Parts(halves[0]);
  const right = halves.length === 2 ? parseIpv6Parts(halves[1]) : [];
  if (!left || !right) return null;

  if (halves.length === 1) {
    if (left.length !== IPV6_PART_COUNT) return null;
    return ipv6PartsToBigInt(left);
  }

  const missingPartCount = IPV6_PART_COUNT - left.length - right.length;
  if (missingPartCount < 1) return null;

  return ipv6PartsToBigInt([...left, ...Array(missingPartCount).fill(0), ...right]);
}

function parseIpv4Suffix(ip: string): { prefix: string; high: string; low: string } | null {
  if (!ip.includes('.')) return null;

  const lastColonIndex = ip.lastIndexOf(':');
  if (lastColonIndex === -1) return null;

  const prefix = ip.slice(0, lastColonIndex);
  const ipv4 = parseIpv4(ip.slice(lastColonIndex + 1));
  if (ipv4 === null) return null;

  return {
    prefix,
    high: Math.floor(ipv4 / 0x10000).toString(16),
    low: (ipv4 % 0x10000).toString(16),
  };
}

function parseIpv6Parts(value: string): number[] | null {
  if (!value) return [];

  const parts = value.split(':');
  if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;

  return parts.map((part) => Number.parseInt(part, 16));
}

function ipv6PartsToBigInt(parts: number[]): bigint {
  return parts.reduce((value, part) => value * IPV6_PART_BASE + BigInt(part), BigInt(0));
}

function ipv4Base(...octets: number[]): number {
  const value = octets.reduce((base, octet) => base * IPV4_PART_BASE + octet, 0);
  return value * IPV4_PART_BASE ** (IPV4_OCTET_COUNT - octets.length);
}

function ipv6Base(...parts: number[]): bigint {
  return ipv6PartsToBigInt([...parts, ...Array(IPV6_PART_COUNT - parts.length).fill(0)]);
}

function isIpv4InRange(address: number, range: IPv4Range): boolean {
  const size = 2 ** (32 - range.prefix);
  const start = Math.floor(range.base / size) * size;
  const end = start + size - 1;

  return address >= start && address <= end;
}

function isIpv6InRange(address: bigint, range: IPv6Range): boolean {
  const shift = BigInt(128 - range.prefix);

  return address >> shift === range.base >> shift;
}
