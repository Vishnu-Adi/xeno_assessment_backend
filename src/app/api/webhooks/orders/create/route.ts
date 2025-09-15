import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getEnv } from '@/lib/env';
import { getPrisma } from '@/lib/db';
import { resolveTenantIdFromShopDomain } from '@/lib/tenant';
import * as OrdersRepo from '@/repos/orders';

export async function POST(req: NextRequest) {
  const env = getEnv();
  const prisma = getPrisma();

  const hmac = req.headers.get('x-shopify-hmac-sha256');
  const shop = req.headers.get('x-shopify-shop-domain');
  const eventId = req.headers.get('x-shopify-event-id');
  if (!hmac || !shop || !eventId) return NextResponse.json({ error: 'Missing headers' }, { status: 400 });

  const rawBody = await req.text();
  const digest = crypto.createHmac('sha256', env.SHOPIFY_API_SECRET).update(rawBody, 'utf8').digest('base64');
  if (!timingSafeEqualBase64(hmac, digest)) return new NextResponse('Unauthorized', { status: 401 });

  const payload = JSON.parse(rawBody);
  const tenantId = await resolveTenantIdFromShopDomain(shop);

  // Idempotency via INSERT IGNORE
  const inserted = await prisma.$executeRawUnsafe(
    'INSERT IGNORE INTO `WebhookEvent` (`tenantId`, `eventId`, `receivedAt`) VALUES (?, ?, NOW(6))',
    tenantId, eventId
  );
  if (inserted === 0) return NextResponse.json({ ok: true, deduped: true });

  await OrdersRepo.upsertFromShopify({ tenantId }, payload);

  return NextResponse.json({ ok: true });
}

function timingSafeEqualBase64(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}


