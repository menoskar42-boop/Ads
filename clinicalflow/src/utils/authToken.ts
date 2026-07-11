const LS_TOKEN_KEY   = 'cf_token';
const LS_REFRESH_KEY = 'cf_refresh';
const LS_USER_KEY    = 'cf_user';

export function getToken(): string | null {
  return localStorage.getItem(LS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(LS_REFRESH_KEY);
}

export function saveAuthSession(token: string, refresh: string, user: object) {
  localStorage.setItem(LS_TOKEN_KEY,   token);
  localStorage.setItem(LS_REFRESH_KEY, refresh);
  localStorage.setItem(LS_USER_KEY,    JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(LS_TOKEN_KEY);
  localStorage.removeItem(LS_REFRESH_KEY);
  localStorage.removeItem(LS_USER_KEY);
}

export function loadSavedAuthUser<T>(): T | null {
  try {
    const raw = localStorage.getItem(LS_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
