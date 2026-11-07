// Thin API client: session cookies + CSRF header, JSON errors, and a small
// connection-health tracker that drives the "connection lost" banner.

let csrfToken = null
export function setCsrf(token) {
  csrfToken = token
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

// ── connection health ──
let failures = 0
const listeners = new Set()
function emit() {
  listeners.forEach((fn) => fn(failures >= 2))
}
export function onConnectionChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    failures++
    emit()
    throw new ApiError('Cannot reach the server', 0, null)
  }
  failures = 0
  emit()

  let data = null
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // CSV or non-JSON payloads land here only on the download helpers.
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data)
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
}
