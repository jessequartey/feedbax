// Where a webhook may point. Pure, so the admin form, the server and the tests share one rule.
// Production (an https PORTAL_URL) accepts only https URLs on public hosts. Local development
// (an http PORTAL_URL) also accepts http and loopback/private hosts so receivers can run beside
// the portal. A Worker cannot resolve DNS before fetching, so a public name that resolves to a
// private address is not caught here: Workers cannot reach private networks anyway, and the
// delivery fetch never follows redirects.

const MAX_URL = 2048;

/** Dotted IPv4 (the WHATWG URL parser already turned 0x7f.1 and 2130706433 into this form). */
function ipv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number) as [number, number, number, number];
  return parts.every((part) => part <= 255) ? parts : null;
}

function privateV4([a, b, c]: [number, number, number, number]): boolean {
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  );
}

/** The hextets of an IPv6 literal (without brackets), or null if it is not a valid one. */
function ipv6(host: string): number[] | null {
  if (!host.includes(":")) return null;
  let text = host;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    const v4 = ipv4(tail[1]!);
    if (!v4) return null;
    text =
      text.slice(0, -tail[1]!.length) +
      `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill("0"), ...rest];
  const numbers = groups.map((group) =>
    /^[0-9a-f]{1,4}$/i.test(group) ? parseInt(group, 16) : NaN,
  );
  return numbers.length === 8 && numbers.every((n) => !Number.isNaN(n)) ? numbers : null;
}

function privateV6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (groups.every((group) => group === 0)) return true; // ::
  if (groups.slice(0, 7).every((group) => group === 0) && g7 === 1) return true; // ::1
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  // IPv4 inside IPv6: ::ffff:a.b.c.d (mapped), ::a.b.c.d (compatible), 64:ff9b::a.b.c.d (NAT64).
  const embedded: [number, number, number, number] = [g6 >> 8, g6 & 255, g7 >> 8, g7 & 255];
  const zeros = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (
    (zeros && (g5 === 0xffff || g5 === 0)) ||
    (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0)
  )
    return privateV4(embedded);
  // 2002::/16 (6to4) embeds the v4 address in the next two groups.
  if (g0 === 0x2002) return privateV4([g1 >> 8, g1 & 255, g2 >> 8, g2 & 255]);
  return false;
}

const LOCAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".private",
];

/** True for hosts that name this machine or a private network. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = ipv6(host.slice(1, -1));
    return groups ? privateV6(groups) : true;
  }
  const v4 = ipv4(host);
  if (v4) return privateV4(v4);
  if (host === "localhost" || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // A name with no dot ("metadata", "db") only resolves inside a private network.
  return !host.includes(".");
}

/**
 * Why `raw` is not an acceptable webhook URL, or null when it is. `lenient` (local development)
 * allows http and private hosts; it must come from the deployment (PORTAL_URL), never the client.
 */
export function webhookUrlProblem(raw: unknown, lenient = false): string | null {
  if (typeof raw !== "string" || !raw.trim()) return "Enter a URL.";
  if (raw.length > MAX_URL) return "That URL is too long.";
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/u.test(raw)) return "That doesn't look like a URL.";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That doesn't look like a URL.";
  }
  if (url.protocol !== "https:" && !(lenient && url.protocol === "http:"))
    return lenient ? "Use an http or https URL." : "Use an https URL.";
  if (url.username || url.password) return "Remove the username and password from the URL.";
  if (!lenient && isPrivateHost(url.hostname))
    return "That address is private or local. Use a public https URL.";
  return null;
}
