// src/app/api/webhooks/carts/create/route.ts
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
  const h = req.headers.get('x-shopify-hmac-sha256') || ''
  const shop = req.headers.get('x-shopify-shop-domain') || ''
  const eventId = req.headers.get('x-shopify-event-id') || ''
  const digest = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(raw).digest('base64')
  try { if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(digest))) return new NextResponse('invalid hmac', { status: 401 }) } catch { return new NextResponse('invalid hmac', { status: 401 }) }

  const payload = JSON.parse(raw.toString('utf8'))
  const tenantId = await resolveTenantIdFromShopDomain(shop)

  await prisma.webhookEvent.create({ data: { tenantId, eventId, eventType: 'carts/create' } }).catch(()=>null)

  // Minimal Cart model upsert
  await prisma.cart.upsert({
    where: { tenantId_cartToken: { tenantId, cartToken: payload.token } }, // token is string
    update: {
      currency: payload.currency || 'USD',
      totalPrice: payload.items_subtotal_price ? payload.items_subtotal_price : '0',
    },
    create: {
      tenantId,
      cartToken: payload.token,
      currency: payload.currency || 'USD',
      totalPrice: payload.items_subtotal_price ? payload.items_subtotal_price : '0',
      createdAt: new Date()
    }
  })

  return NextResponse.json({ ok: true })
}
