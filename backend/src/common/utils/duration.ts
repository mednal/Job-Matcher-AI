const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

// Parses jsonwebtoken/@nestjs/jwt-style short duration strings ("15m", "30d")
// into milliseconds. Shared by RefreshTokenService (expiry) and AuthService
// (access-token expiresIn) so both read JWT_ACCESS_TTL / JWT_REFRESH_TTL the
// same way.
export function parseDurationMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${duration}" — expected a number followed by ms, s, m, h, or d`,
    );
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
