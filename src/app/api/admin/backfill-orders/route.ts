import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import * as OrdersRepo from '@/repos/orders'

export const runtime = 'nodejs'

/**
 * Backfill orders via Admin GraphQL.
 * Body: { shop: string; accessToken?: string; first?: number }
 */
export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const { shop, accessToken: bodyToken, first = 50 } = (await req.json()) as { shop?: string; accessToken?: string; first?: number }
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })

  let accessToken = bodyToken as string | undefined
  if (!accessToken) {
    const store = await prisma.store.findFirst({ where: { shopDomain: shop } })
    accessToken = store?.accessToken
  }
  if (!accessToken) return NextResponse.json({ error: 'store not installed and no accessToken provided' }, { status: 404 })

  const tenantId = await resolveTenantIdFromShopDomain(shop)
  const endpoint = `https://${shop}/admin/api/2024-10/graphql.json`

  let hasNextPage = true
  let cursor: string | null = null
  let upserts = 0

  while (hasNextPage) {
    const query = `
      query Orders($first: Int!, $after: String) {
        orders(first: $first, after: $after, sortKey: CREATED_AT) {
          edges { node { id createdAt totalPriceSet { shopMoney { amount currencyCode } } presentmentCurrencyCode financialStatus customer { id } } cursor }
          pageInfo { hasNextPage endCursor }
        }
      }
    `
    const res: Response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken! },
      body: JSON.stringify({ query, variables: { first: Math.min(100, Number(first)), after: cursor } })
    })
    if (!res.ok) return NextResponse.json({ error: 'admin_graphql_error', status: res.status, text: await res.text() }, { status: 502 })
    const json = await res.json()
    const edges = json?.data?.orders?.edges ?? []
    for (const edge of edges) {
      const o = edge.node
      const id = String(o.id).split('/').pop()
      const customerId = o.customer?.id ? String(o.customer.id).split('/').pop() : undefined
      const payload = {
        id,
        created_at: o.createdAt,
        current_total_price: o.totalPriceSet?.shopMoney?.amount ?? undefined,
        currency: o.totalPriceSet?.shopMoney?.currencyCode ?? o.presentmentCurrencyCode ?? 'USD',
        presentment_currency: o.presentmentCurrencyCode ?? undefined,
        financial_status: (o.financialStatus || '').toLowerCase(),
        customer: customerId ? { id: customerId } : undefined,
      }
      await OrdersRepo.upsertFromShopify({ tenantId }, payload as any)
      upserts++
    }
    hasNextPage = Boolean(json?.data?.orders?.pageInfo?.hasNextPage)
    cursor = json?.data?.orders?.pageInfo?.endCursor ?? null
  }

  return NextResponse.json({ ok: true, upserts })
}


