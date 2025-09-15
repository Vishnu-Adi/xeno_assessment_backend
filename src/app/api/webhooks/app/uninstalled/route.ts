// src/app/api/webhooks/app/uninstalled/route.ts
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
  try { if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))) return new NextResponse('invalid hmac', { status: 401 }) } catch { return new NextResponse('invalid hmac', { status: 401 }) }

  const payload = JSON.parse(raw.toString('utf8'))
  const tenantId = await resolveTenantIdFromShopDomain(shop)

  await prisma.webhookEvent.create({ data: { tenantId, eventId, eventType: 'app/uninstalled' } }).catch(()=>null)

  // Clean up store data when app is uninstalled
  await prisma.store.deleteMany({ where: { shopDomain: shop } })

  return NextResponse.json({ ok: true })
}
