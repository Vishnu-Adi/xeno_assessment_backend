// src/app/api/webhooks/products/create/route.ts
// UPDATED FOR NEW GRAPHQL PRODUCT APIS - Compatible with both old and new webhook formats
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getEnv } from '@/lib/env'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { SHOPIFY_API_SECRET } = getEnv()
  const prisma = getPrisma()
  const raw = Buffer.from(await req.arrayBuffer())
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  const shop = req.headers.get('x-shopify-shop-domain') || ''
  const eventId = req.headers.get('x-shopify-event-id') || ''
  const digest = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(raw).digest('base64')
  try { if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))) return new NextResponse('invalid hmac',{status:401}) } catch { return new NextResponse('invalid hmac',{status:401}) }

  const payload = JSON.parse(raw.toString('utf8'))
  const tenantId = await resolveTenantIdFromShopDomain(shop)

  await prisma.webhookEvent.create({ data: { tenantId, eventId, eventType: 'products/create' } }).catch(()=>null)

  // Handle both old REST format (numeric ID) and new GraphQL format (global ID)
  let productId: string
  if (typeof payload.id === 'string' && payload.id.includes('gid://shopify/Product/')) {
    // New GraphQL format: gid://shopify/Product/123 -> 123
    productId = payload.id.split('/').pop()
  } else {
    // Old REST format: numeric ID
    productId = String(payload.id)
  }

  // Enhanced product data handling for new API structure
  const productData = {
    title: payload.title,
    updatedAt: new Date(),
    // Handle additional fields that may be present in new API
    ...(payload.handle && { handle: payload.handle }),
    ...(payload.status && { status: payload.status }),
    ...(payload.created_at && { createdAt: new Date(payload.created_at) })
  }

  await prisma.product.upsert({
    where: { tenantId_shopifyProductId: { tenantId, shopifyProductId: BigInt(productId) } },
    update: productData,
    create: { 
      tenantId, 
      shopifyProductId: BigInt(productId), 
      ...productData,
      createdAt: productData.createdAt || new Date()
    }
  })

  return NextResponse.json({ 
    ok: true, 
    productId, 
    apiCompatible: true,
    format: payload.id.toString().includes('gid://') ? 'graphql' : 'rest'
  })
}
