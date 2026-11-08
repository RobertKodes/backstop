// X (Twitter) posting behind the X_ENABLED feature flag.

export interface Poster {
  readonly enabled: boolean;
  post(text: string): Promise<{ id: string } | null>;
}

/** Feature flag off: nothing leaves the process. */
export class DisabledPoster implements Poster {
  readonly enabled = false;
  async post(): Promise<null> {
    return null;
  }
}

/**
 * X API v2 `POST /2/tweets` with an OAuth 2.0 user-context access token
 * (scope `tweet.write`). The token is obtained out of band and supplied via
 * the environment; it is never logged.
 */
export class XApiPoster implements Poster {
  readonly enabled = true;
  constructor(
    private readonly token: string,
    private readonly url = "https://api.x.com/2/tweets",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!token) throw new Error("X_ACCESS_TOKEN is required when X_ENABLED=true");
  }

  async post(text: string): Promise<{ id: string }> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }; title?: string; detail?: string };
    if (!res.ok || !body.data?.id) {
      throw new Error(`X post failed (${res.status}): ${body.title ?? ""} ${body.detail ?? ""}`.trim());
    }
    return { id: body.data.id };
  }
}

/** Fit a post into X's limit, appending an optional suffix (e.g. a feed link). */
export function fitPost(text: string, suffix = "", max = 280): string {
  const sfx = suffix ? ` ${suffix}` : "";
  const room = max - sfx.length;
  const body = text.length <= room ? text : `${text.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  return body + sfx;
}
