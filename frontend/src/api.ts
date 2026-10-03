export type Role = 'ADMIN' | 'COLLECTOR' | 'REVIEWER' | 'FARMER';

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
}

const TOKEN_KEY = 'ffs_token';
const USER_KEY = 'ffs_user';

export const authStore = {
  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  },
  set(token: string, user: User) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join('；')
      : data?.message ?? `请求失败（${res.status}）`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}
