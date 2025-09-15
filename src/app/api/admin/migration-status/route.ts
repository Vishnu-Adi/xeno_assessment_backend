// src/app/api/admin/migration-status/route.ts
// API endpoint to check Shopify API migration compliance status
import { NextRequest, NextResponse } from 'next/server'
import { checkMigrationCompliance } from '@/lib/shopify-api-migration'
import { getPrisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get('shop')

    if (!shop) {
      return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 })
    }

    const prisma = getPrisma()
    
    // Get store information
    const store = await prisma.store.findFirst({
      where: { shopDomain: shop },
      select: { 
        shopDomain: true, 
        createdAt: true,
        accessToken: true // We have access token, so we can make API calls
      }
    })

    if (!store) {
      return NextResponse.json({ error: 'Store not found or not installed' }, { status: 404 })
    }

    // Check migration compliance
    const compliance = checkMigrationCompliance()

    // Get webhook registration status (simplified check)
    const webhooks = await fetch(`https://${shop}/admin/api/2024-10/webhooks.json`, {
      headers: {
        'X-Shopify-Access-Token': store.accessToken as string
      }
    }).then(res => res.ok ? res.json() : { webhooks: [] }).catch(() => ({ webhooks: [] }))

    const registeredWebhooks = (webhooks.webhooks || []).map((w: any) => w.topic)
    const requiredWebhooks = ['products/create', 'products/update', 'carts/create', 'carts/update', 'app/uninstalled']
    const missingWebhooks = requiredWebhooks.filter(topic => !registeredWebhooks.includes(topic))

    // API usage recommendations
    const recommendations = []
    
    if (!compliance.isCompliant) {
      recommendations.push({
        type: 'urgent',
        title: 'Migration Required',
        message: `Your ${compliance.appType} app must migrate to new GraphQL Product APIs by ${compliance.deadline}. Only ${compliance.daysRemaining} days remaining!`
      })
    }

    if (missingWebhooks.length > 0) {
      recommendations.push({
        type: 'warning',
        title: 'Missing Webhooks',
        message: `Missing webhooks: ${missingWebhooks.join(', ')}. Re-install the app to register all required webhooks.`
      })
    }

    if (compliance.isCompliant && missingWebhooks.length === 0) {
      recommendations.push({
        type: 'success',
        title: 'Fully Compliant',
        message: 'Your app is using the latest Shopify APIs and all webhooks are properly registered.'
      })
    }

    return NextResponse.json({
      shop,
      migration: compliance,
      webhooks: {
        registered: registeredWebhooks,
        required: requiredWebhooks,
        missing: missingWebhooks,
        total: registeredWebhooks.length,
        compliance: missingWebhooks.length === 0
      },
      store: {
        domain: store.shopDomain,
        installedAt: store.createdAt,
        hasAccessToken: !!store.accessToken
      },
      recommendations,
      apiVersion: '2024-10',
      lastChecked: new Date().toISOString()
    })

  } catch (error) {
    console.error('Migration status check failed:', error)
    return NextResponse.json({ 
      error: 'Failed to check migration status',
      detail: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
