import type {
  AdminSessionStatus,
  ConfigBundle,
  ConfigHistoryItem,
  MuseumConfig,
  PublicConfigResponse,
} from "../types/api";

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchPublicConfig(): Promise<PublicConfigResponse> {
  return requestJson<PublicConfigResponse>("/api/public/config", {
    headers: {},
  });
}

export async function fetchAdminSession(): Promise<AdminSessionStatus> {
  return requestJson<AdminSessionStatus>("/api/admin/session", {
    headers: {},
  });
}

export async function loginAdmin(password: string, csrfToken: string): Promise<AdminSessionStatus> {
  return requestJson<AdminSessionStatus>("/api/admin/login", {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ password }),
  });
}

export async function logoutAdmin(csrfToken: string): Promise<void> {
  await requestJson("/api/admin/logout", {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({}),
  });
}

export async function fetchConfigBundle(): Promise<ConfigBundle> {
  return requestJson<ConfigBundle>("/api/admin/config", {
    headers: {},
  });
}

export async function updateDraftConfig(config: MuseumConfig, csrfToken: string): Promise<void> {
  await requestJson("/api/admin/config", {
    method: "PUT",
    headers: {
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(config),
  });
}

export async function publishDraft(csrfToken: string): Promise<{ version: number; publishedAt: string }> {
  return requestJson<{ version: number; publishedAt: string }>("/api/admin/config/publish", {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({}),
  });
}

export async function fetchHistory(): Promise<ConfigHistoryItem[]> {
  return requestJson<ConfigHistoryItem[]>("/api/admin/config/history", {
    headers: {},
  });
}

export async function resetRealtimeSession(csrfToken: string): Promise<{ closed: boolean }> {
  return requestJson<{ closed: boolean }>("/api/admin/session/reset", {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({}),
  });
}
