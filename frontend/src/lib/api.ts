import type {
  AdminSessionStatus,
  ConfigBundle,
  ConfigHistoryItem,
  MuseumConfig,
  PublicConfigResponse,
} from "../types/api";

export type ApiFieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  status: number;
  fieldErrors: ApiFieldErrors;

  constructor(message: string, status: number, fieldErrors: ApiFieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function normalizeFieldErrors(payload: unknown): ApiFieldErrors {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  return Object.entries(payload as Record<string, unknown>).reduce<ApiFieldErrors>((result, [key, value]) => {
    if (Array.isArray(value)) {
      result[key] = value.map((item) => String(item));
    }
    return result;
  }, {});
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { detail?: unknown; message?: string };
      const detail =
        payload && typeof payload === "object" && "detail" in payload && payload.detail !== undefined
          ? payload.detail
          : payload;

      const message =
        typeof detail === "string"
          ? detail
          : detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string"
            ? detail.message
            : typeof payload.message === "string"
              ? payload.message
              : `请求失败（${response.status}）`;

      const fieldErrors =
        detail && typeof detail === "object" && "fieldErrors" in detail
          ? normalizeFieldErrors(detail.fieldErrors)
          : {};

      throw new ApiError(message, response.status, fieldErrors);
    }

    const detail = await response.text();
    throw new ApiError(detail || `请求失败（${response.status}）`, response.status);
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

export async function publishDraft(
  csrfToken: string,
  config?: MuseumConfig,
): Promise<{ version: number; publishedAt: string }> {
  return requestJson<{ version: number; publishedAt: string }>("/api/admin/config/publish", {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(config ?? {}),
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
