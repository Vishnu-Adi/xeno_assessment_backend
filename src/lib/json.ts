export function json(data: any, init: ResponseInit = {}) {
  return new Response(
    JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
    { status: 200, headers: { 'content-type': 'application/json' }, ...init }
  )
}

// Safe JSON stringify that handles BigInt
export function safeJson(data: any): any {
  return JSON.parse(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
}