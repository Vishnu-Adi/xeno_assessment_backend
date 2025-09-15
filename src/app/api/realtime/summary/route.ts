import { NextRequest } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const prisma = getPrisma()
  const url = new URL(req.url)
  const shop = url.searchParams.get('shop')
  if (!shop) {
    return new Response('missing shop', { status: 400 })
  }
  const shopDomain: string = shop
  const tenantId = await resolveTenantIdFromShopDomain(shop)

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      let timer: any
      async function computeAndSend() {
        if (closed) return
        const now = new Date()
        const d24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

        let source: 'cart' | 'checkout' | 'none' = 'none'
        let active24h = 0
        let value24h = 0
        let completionRate7d = 0

        // Get product count directly from Shopify for accuracy
        let productCount = 0
        let newProducts7d = 0
        
        try {
          // Get store access token for this shop
          const store = await prisma.store.findFirst({
            where: { shopDomain: shopDomain },
            select: { accessToken: true }
          })
          
          if (store?.accessToken) {
            // Fetch active products from Shopify
            const response = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': store.accessToken,
              },
              body: JSON.stringify({
                query: `{
                  products(first: 250, query: "status:active") {
                    edges {
                      node {
                        id
                        createdAt
                      }
                    }
                  }
                }`
              })
            })
            
            if (response.ok) {
              const data = await response.json()
              const products = data.data?.products?.edges || []
              productCount = products.length
              
              // Count products created in last 7 days
              newProducts7d = products.filter((edge: any) => {
                const createdAt = new Date(edge.node.createdAt)
                return createdAt >= d7
              }).length
            } else {
              // Fallback to local DB
              const [localCount, localNew] = await Promise.all([
                prisma.product.count({ where: { tenantId } }),
                prisma.product.count({ where: { tenantId, createdAt: { gte: d7 } } }),
              ])
              productCount = localCount
              newProducts7d = localNew
            }
          } else {
            // No access token, use local DB
            const [localCount, localNew] = await Promise.all([
              prisma.product.count({ where: { tenantId } }),
              prisma.product.count({ where: { tenantId, createdAt: { gte: d7 } } }),
            ])
            productCount = localCount
            newProducts7d = localNew
          }
        } catch (error) {
          console.error('Failed to fetch products from Shopify:', error)
          // Fallback to local DB
          const [localCount, localNew] = await Promise.all([
            prisma.product.count({ where: { tenantId } }),
            prisma.product.count({ where: { tenantId, createdAt: { gte: d7 } } }),
          ])
          productCount = localCount
          newProducts7d = localNew
        }

        const [checkoutCount, cartCount] = await Promise.all([
          prisma.checkout.count({ where: { tenantId } }).catch(() => 0),
          prisma.cart.count({ where: { tenantId } }).catch(() => 0),
        ])

        if (cartCount > 0) {
          source = 'cart'
          const [created24h, sumRows, created7, updated7] = await Promise.all([
            prisma.cart.count({ where: { tenantId, createdAt: { gte: d24 } } }),
            prisma.$queryRaw<{ total: string | number | null }[]>`
              SELECT SUM(totalPrice) AS total FROM Cart WHERE tenantId = ${tenantId} AND createdAt >= ${d24}
            `,
            prisma.cart.count({ where: { tenantId, createdAt: { gte: d7 } } }),
            prisma.cart.count({ where: { tenantId, updatedAt: { gte: d7 } } }),
          ])
          active24h = created24h
          value24h = Number(sumRows?.[0]?.total ?? 0)
          completionRate7d = created7 > 0 ? Math.min(1, updated7 / created7) : 0
        } else if (checkoutCount > 0) {
          source = 'checkout'
          const [created24h, sum24h, created7, completed7] = await Promise.all([
            prisma.checkout.count({ where: { tenantId, createdAt: { gte: d24 } } }),
            prisma.checkout.aggregate({ where: { tenantId, createdAt: { gte: d24 } }, _sum: { totalPrice: true } }),
            prisma.checkout.count({ where: { tenantId, createdAt: { gte: d7 } } }),
            prisma.checkout.count({ where: { tenantId, completedAt: { gte: d7 } } }),
          ])
          active24h = created24h
          value24h = Number(sum24h._sum.totalPrice ?? 0)
          completionRate7d = created7 > 0 ? completed7 / created7 : 0
        }

        const payload = JSON.stringify({
          productCount,
          newProducts7d,
          activeCheckouts24h: active24h,
          checkoutValue24h: value24h,
          completionRate7d,
          source,
        })
        try {
          controller.enqueue(`data: ${payload}\n\n`)
        } catch {}
      }

      await computeAndSend()
      timer = setInterval(computeAndSend, 3000)
      // @ts-ignore
      controller._timer = timer
    },
    cancel(reason) {
      // @ts-ignore
      if (this._timer) clearInterval(this._timer)
      // @ts-ignore
      this._timer = undefined
      // Mark closed so compute stops
      // @ts-ignore
      this._closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}


