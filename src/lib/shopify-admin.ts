// Small helper to call Admin GraphQL using the accessToken stored in your DB.
import { getPrisma } from '@/lib/db'

function envTokenForShop(shop: string): string | undefined {
  const base = shop.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  const byShop = process.env[`SHOPIFY_TOKEN_${base}`]
  return byShop || process.env.SHOPIFY_ACCESS_TOKEN
}

export async function adminFetch(shop: string, query: string, variables?: any) {
  let token: string | undefined

  // Try DB first, but tolerate DB outages and fall back to env
  try {
    const prisma = getPrisma()
    const store = await prisma.store.findFirst({ where: { shopDomain: shop } })
    token = store?.accessToken
  } catch (_e) {
    // ignore and try env
  }

  if (!token) token = envTokenForShop(shop)
  if (!token) throw new Error(`Missing access token for store ${shop}. Provide in DB or env (SHOPIFY_TOKEN_${shop.toUpperCase().replace(/[^A-Z0-9]/g, '_')} or SHOPIFY_ACCESS_TOKEN).`)

  const res = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors ?? json))
  }
  return json.data
}
