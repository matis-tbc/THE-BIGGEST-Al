const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface AuthLike {
  getStoredTokens(): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  } | null>;
  refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }>;
}

export interface GraphFetchOptions extends RequestInit {
  clientRequestId?: string;
}

export async function graphFetch(
  authService: AuthLike,
  endpoint: string,
  init?: GraphFetchOptions,
): Promise<Response> {
  let tokens = await authService.getStoredTokens();
  if (!tokens) {
    throw new Error("Not signed in");
  }

  const buildHeaders = (accessToken: string): Record<string, string> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (init?.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (init?.clientRequestId) {
      headers["client-request-id"] = init.clientRequestId;
    }
    return headers;
  };

  const url = endpoint.startsWith("http") ? endpoint : `${GRAPH_BASE}${endpoint}`;

  let response = await fetch(url, { ...init, headers: buildHeaders(tokens.accessToken) });

  if (response.status === 401 && tokens.refreshToken) {
    tokens = await authService.refreshAccessToken(tokens.refreshToken);
    response = await fetch(url, { ...init, headers: buildHeaders(tokens.accessToken) });
  }

  return response;
}

export async function graphJson<T = any>(
  authService: AuthLike,
  endpoint: string,
  init?: GraphFetchOptions,
): Promise<T> {
  const response = await graphFetch(authService, endpoint, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Graph ${init?.method || "GET"} ${endpoint} failed (${response.status}): ${body}`,
    );
  }
  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}
