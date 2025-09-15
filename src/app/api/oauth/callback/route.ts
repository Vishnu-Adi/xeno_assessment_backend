// src/app/api/oauth/callback/route.ts
// UPDATED FOR SHOPIFY API MIGRATION COMPLIANCE - Using 2024-10 API version
import { NextRequest, NextResponse } from 'next/server'
import { getEnv } from '@/lib/env'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import { checkMigrationCompliance } from '@/lib/shopify-api-migration'

export const runtime = 'nodejs' // ✅ Next 15 expects 'nodejs' or 'edge'

export async function GET(req: NextRequest) {
  const env = getEnv()
  const prisma = getPrisma()

  try {
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get('shop')
    const code = searchParams.get('code')

    if (!shop || !code) {
      return NextResponse.json({ error: 'Missing shop or code' }, { status: 400 })
    }
    if (!shop.endsWith('.myshopify.com')) {
      return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
    }

    // 1) Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.SHOPIFY_API_KEY,
        client_secret: env.SHOPIFY_API_SECRET,
        code
      })
    })

    if (!tokenRes.ok) {
      const detail = await tokenRes.text().catch(() => '')
      console.error('Token exchange failed:', tokenRes.status, detail)
      return NextResponse.json({ error: 'Token exchange failed', detail }, { status: 400 })
    }

    const tokenJson = (await tokenRes.json()) as { access_token: string }
    const accessToken = tokenJson.access_token

    // 2) Resolve/create tenant id (Buffer(16))
    const tenantId = await resolveTenantIdFromShopDomain(shop)

    // 3) Ensure Tenant exists (PK is `id`)
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: shop }
    })

    // 4) Upsert Store for this shop and tenant
    const existing = await prisma.store.findFirst({ where: { shopDomain: shop } })
    if (existing) {
      await prisma.store.update({
        where: { id: existing.id },
        data: { accessToken, tenantId }
      })
    } else {
      await prisma.store.create({
        data: { tenantId, shopDomain: shop, accessToken }
      })
    }

    // 5) Check migration compliance and register webhooks
    const compliance = checkMigrationCompliance()
    console.log('Shopify API Migration Status:', compliance)

    const topics = [
      'products/create',
      'products/update',
      'customers/create',
      'customers/update',
      'orders/create',
      'orders/update',
      'carts/create',
      'carts/update',
      'app/uninstalled',
    ]

    const baseWebhookUrl = `${env.SHOPIFY_APP_URL}/api/webhooks`
    const webhookResults: Array<{ topic: string; success: boolean; error?: string }> = []

    // Use 2024-10 API version for webhook registration (migration compliant)
    await Promise.all(
      topics.map(async (topic) => {
        try {
          const resp = await fetch(`https://${shop}/admin/api/2024-10/webhooks.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({
              webhook: { 
                topic, 
                format: 'json', 
                address: `${baseWebhookUrl}/${topic.replace('/', '/')}` // Ensure correct URL format
              }
            })
          })
          
          if (resp.ok) {
            webhookResults.push({ topic, success: true })
            console.log(`✅ Webhook registered: ${topic}`)
          } else {
            const errorText = await resp.text()
            webhookResults.push({ topic, success: false, error: errorText })
            console.error(`❌ Failed to register webhook ${topic}:`, errorText)
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          webhookResults.push({ topic, success: false, error: errorMsg })
          console.error(`❌ Webhook registration error ${topic}:`, errorMsg)
        }
      })
    )

    // Add compliance info to redirect URL for dashboard display
    const complianceParams = new URLSearchParams({
      shop,
      migrationCompliant: compliance.isCompliant.toString(),
      daysRemaining: compliance.daysRemaining.toString(),
      webhooksRegistered: webhookResults.filter(w => w.success).length.toString(),
      totalWebhooks: webhookResults.length.toString()
    })

    // Redirect to your dashboard after install
    return NextResponse.redirect(`${env.SHOPIFY_APP_URL}/dashboard?${complianceParams.toString()}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('OAuth callback exception:', msg)
    return NextResponse.json({ error: 'OAuth callback exception', detail: msg }, { status: 500 })
  }
}
