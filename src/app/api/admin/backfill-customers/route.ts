import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import * as CustomersRepo from '@/repos/customers'

export const runtime = 'nodejs'

/**
 * Backfill customers via Admin GraphQL.
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
      query Customers($first: Int!, $after: String) {
        customers(first: $first, after: $after, sortKey: CREATED_AT) {
          edges { node { id email firstName lastName createdAt } cursor }
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
    const edges = json?.data?.customers?.edges ?? []
    for (const edge of edges) {
      const c = edge.node
      const id = String(c.id).split('/').pop()!
      await CustomersRepo.upsertFromShopify({ tenantId }, {
        id,
        email: c.email ?? undefined,
        first_name: c.firstName ?? undefined,
        last_name: c.lastName ?? undefined,
        created_at: c.createdAt ?? undefined,
      })
      upserts++
    }
    hasNextPage = Boolean(json?.data?.customers?.pageInfo?.hasNextPage)
    cursor = json?.data?.customers?.pageInfo?.endCursor ?? null
  }

  return NextResponse.json({ ok: true, upserts })
}


