// src/app/api/webhooks/checkouts/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getEnv } from '@/lib/env'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import { Prisma } from '@prisma/client'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { SHOPIFY_API_SECRET } = getEnv()
  const prisma = getPrisma()

  const raw = Buffer.from(await req.arrayBuffer())
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  const shop = req.headers.get('x-shopify-shop-domain') || ''
  const eventId = req.headers.get('x-shopify-event-id') || ''
  const digest = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(raw).digest('base64')
  try { if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))) return new NextResponse('invalid hmac', { status: 401 }) } catch { return new NextResponse('invalid hmac', { status: 401 }) }

  const payload = JSON.parse(raw.toString('utf8'))
  const tenantId = await resolveTenantIdFromShopDomain(shop)

  await prisma.webhookEvent.create({ data: { tenantId, eventId, eventType: 'checkouts/create' } }).catch(()=>null)

  const total = payload.total_price ?? payload.total_price_set?.shop_money?.amount ?? '0'
  await prisma.checkout.upsert({
    where: { tenantId_shopifyCheckoutId: { tenantId, shopifyCheckoutId: BigInt(payload.id) } },
    update: {
      currency: payload.currency || 'USD',
      totalPrice: new Prisma.Decimal(total),
      completedAt: payload.completed_at ? new Date(payload.completed_at) : null
    },
    create: {
      tenantId,
      shopifyCheckoutId: BigInt(payload.id),
      currency: payload.currency || 'USD',
      totalPrice: new Prisma.Decimal(total),
      completedAt: payload.completed_at ? new Date(payload.completed_at) : null
    }
  })

  return NextResponse.json({ ok: true })
}
