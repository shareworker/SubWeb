/** URL-safe Base64（无填充），用于 subconverter 的 groups/ruleset 参数。 */

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function toUrlSafeBase64(value) {
  const bytes = new TextEncoder().encode(String(value || ''))
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromUrlSafeBase64(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) return ''
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(padded))
  } catch {
    return ''
  }
}
