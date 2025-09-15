import { NextRequest, NextResponse } from 'next/server'
import { adminFetch } from '@/lib/shopify-admin'
export const runtime = 'nodejs'

const RECENT_PRODUCTS_QUERY = `
  query RecentProducts($first: Int!) {
    products(first: $first, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          updatedAt
          status
        }
      }
    }
  }
`

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const shop = url.searchParams.get('shop')
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })

  try {
    const data = await adminFetch(shop, RECENT_PRODUCTS_QUERY, { first: 10 })
    const items = (data.products.edges || []).map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
      updatedAt: e.node.updatedAt,
      status: e.node.status || 'ACTIVE'
    }))
    return NextResponse.json({ items })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}