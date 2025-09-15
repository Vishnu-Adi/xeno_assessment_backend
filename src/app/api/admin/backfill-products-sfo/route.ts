import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'

export const runtime = 'nodejs'

/**
 * Backfill products using Storefront API only (no Admin access required).
 * Accepts body: { shop: string; token: string; first?: number }
 * - Queries published products visible to Storefront and upserts into Product table
 */
export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const { shop, token: tokenFromBody, first = 50 } = (await req.json()) as { shop?: string; token?: string; first?: number }
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })

  function sfoTokenFor(s: string): string {
    if (s === 'tenant-a-demo.myshopify.com') return process.env.STOREFRONT_TOKEN_TENANT_A as string
    if (s === 'tenant-b-demo.myshopify.com') return process.env.STOREFRONT_TOKEN_TENANT_B as string
    throw new Error(`No storefront token configured for ${s}`)
  }

  const token = tokenFromBody || sfoTokenFor(shop)

  const tenantId = await resolveTenantIdFromShopDomain(shop)
  const endpoint = `https://${shop}/api/2024-10/graphql.json`

  let hasNextPage = true
  let cursor: string | null = null
  let upserts = 0

  while (hasNextPage) {
    const query = `
      query Products($first: Int!, $after: String) {
        products(first: $first, after: $after, query: "status:active") {
          edges {
            node {
              id
              title
              createdAt
              updatedAt
            }
            cursor
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `

    const res: Response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query, variables: { first: Math.min(100, Math.max(1, Number(first))), after: cursor } })
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'storefront_graphql_error', status: res.status, text: await res.text() }, { status: 502 })
    }

    const json = await res.json().catch(() => ({}))
    const edges = json?.data?.products?.edges ?? []
    for (const edge of edges) {
      const node = edge?.node
      if (!node?.id) continue
      const numericId: string = String(node.id).split('/').pop()!
      await prisma.product.upsert({
        where: { tenantId_shopifyProductId: { tenantId, shopifyProductId: BigInt(numericId) } },
        update: { title: node.title ?? 'Untitled', updatedAt: new Date(node.updatedAt ?? Date.now()) },
        create: {
          tenantId,
          shopifyProductId: BigInt(numericId),
          title: node.title ?? 'Untitled',
          createdAt: node.createdAt ? new Date(node.createdAt) : new Date(),
          updatedAt: node.updatedAt ? new Date(node.updatedAt) : new Date(),
        }
      })
      upserts++
    }

    hasNextPage = Boolean(json?.data?.products?.pageInfo?.hasNextPage)
    cursor = json?.data?.products?.pageInfo?.endCursor ?? null
  }

  return NextResponse.json({ ok: true, upserts })
}


