const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export class StravaError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "StravaError";
  }
}

/**
 * Minimal Strava API client. Access tokens expire every 6 hours, so every
 * request goes through getAccessToken(), which refreshes lazily. Strava
 * rotates refresh tokens on each refresh; the latest one is kept in memory
 * (the original from the environment remains valid until first used).
 */
export class StravaClient {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshToken: string;
  private refreshing: Promise<string> | null = null;

  constructor(private readonly config: StravaConfig) {
    this.refreshToken = config.refreshToken;
  }

  private async getAccessToken(): Promise<string> {
    // 60s margin so a token can't expire mid-request
    if (this.accessToken && Date.now() / 1000 < this.expiresAt - 60) {
      return this.accessToken;
    }
    if (!this.refreshing) {
      this.refreshing = this.refresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new StravaError(
        `Token refresh failed (${res.status}): ${body}`,
        res.status,
      );
    }
    const token = (await res.json()) as TokenResponse;
    this.accessToken = token.access_token;
    this.expiresAt = token.expires_at;
    this.refreshToken = token.refresh_token;
    return token.access_token;
  }

  async get<T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 429) {
      throw new StravaError(
        "Strava rate limit exceeded (default: 200 requests/15 min, 2,000/day). Try again later.",
        429,
      );
    }
    if (!res.ok) {
      const body = await res.text();
      throw new StravaError(`GET ${path} failed (${res.status}): ${body}`, res.status);
    }
    return (await res.json()) as T;
  }
}
