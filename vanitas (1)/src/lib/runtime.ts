/// <reference types="vite/client" />

/** Runtime-safe public endpoint. Override at build time with VITE_API_BASE_URL. */
export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return `${window.location.origin}/api/v1`;
  return '/api/v1';
}

export function getPortalUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
