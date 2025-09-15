import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'

export const runtime = 'nodejs'

function envAdminTokenFor(shop: string): string | undefined {
  const pairs: Array<[RegExp, string[]]> = [
    [/tenant-a/i, ['ADMIN_TOKEN_TENANT_A', 'SHOPIFY_ADMIN_TOKEN_TENANT_A', 'SHOPIFY_ACCESS_TOKEN_TENANT_A']],
    [/tenant-b/i, ['ADMIN_TOKEN_TENANT_B', 'SHOPIFY_ADMIN_TOKEN_TENANT_B', 'SHOPIFY_ACCESS_TOKEN_TENANT_B']],
  ]
  for (const [re, names] of pairs) {
    if (re.test(shop)) {
      for (const n of names) {
        const v = process.env[n]
        if (v) return v
      }
    }
  }
  return undefined
}

export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const { shop, accessToken } = (await req.json()) as { shop?: string; accessToken?: string }
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })

  const token = accessToken || envAdminTokenFor(shop)
  if (!token) return NextResponse.json({ error: 'missing accessToken (body or env)' }, { status: 400 })

  const tenantId = await resolveTenantIdFromShopDomain(shop)

  const existing = await prisma.store.findFirst({ where: { shopDomain: shop } })
  if (existing) {
    await prisma.store.update({ where: { id: existing.id }, data: { accessToken: token, tenantId } })
  } else {
    await prisma.store.create({ data: { tenantId, shopDomain: shop, accessToken: token } })
  }

  return NextResponse.json({ ok: true })
}


