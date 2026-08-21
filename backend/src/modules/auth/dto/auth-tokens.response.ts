export class AuthTokensResponse {
  accessToken!: string;
  refreshToken!: string;
  // Access token lifetime in seconds, so a client knows when to refresh.
  expiresIn!: number;
}
