import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const prisma = getPrisma()
  const url = new URL(req.url)
  const shop = url.searchParams.get('shop') || 'tenant-a-demo.myshopify.com'
  
  const tenantId = await resolveTenantIdFromShopDomain(shop)
  
  // Check all data counts
  const [
    checkoutCount,
    cartCount, 
    productCount,
    tenantInfo
  ] = await Promise.all([
    prisma.checkout.count({ where: { tenantId } }).catch(e => ({ error: e.message })),
    prisma.cart.count({ where: { tenantId } }).catch(e => ({ error: e.message })),
    prisma.product.count({ where: { tenantId } }).catch(e => ({ error: e.message })),
    prisma.tenant.findUnique({ where: { id: tenantId } }).catch(e => ({ error: e.message }))
  ])

  // Get sample data
  const [checkoutSample, cartSample] = await Promise.all([
    prisma.checkout.findFirst({ where: { tenantId } }).catch(() => null),
    prisma.cart.findFirst({ where: { tenantId } }).catch(() => null)
  ])

  return NextResponse.json({
    shop,
    tenantId: Buffer.from(tenantId).toString('hex'),
    counts: {
      checkout: checkoutCount,
      cart: cartCount,
      product: productCount
    },
    tenant: tenantInfo,
    samples: {
      checkout: checkoutSample ? {
        id: checkoutSample.id.toString(),
        shopifyCheckoutId: checkoutSample.shopifyCheckoutId.toString(),
        totalPrice: checkoutSample.totalPrice.toString(),
        createdAt: checkoutSample.createdAt.toISOString()
      } : null,
      cart: cartSample ? {
        id: cartSample.id.toString(),
        cartToken: cartSample.cartToken,
        totalPrice: cartSample.totalPrice.toString(),
        createdAt: cartSample.createdAt.toISOString()
      } : null
    }
  })
}

