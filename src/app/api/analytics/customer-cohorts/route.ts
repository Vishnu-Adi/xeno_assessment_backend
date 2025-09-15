import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import { safeJson } from '@/lib/json'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const prisma = getPrisma()
  const url = new URL(req.url)
  const shop = url.searchParams.get('shop')
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })
  const tenantId = await resolveTenantIdFromShopDomain(shop)

  try {
    // Get customer cohort data - customers grouped by their first order month
    const cohortData = await prisma.$queryRaw<{
      cohortMonth: string;
      newCustomers: number;
      returningCustomers: number;
      totalRevenue: number;
      avgLifetimeValue: number;
    }[]>`
      WITH first_orders AS (
        SELECT 
          customerShopifyId,
          DATE_FORMAT(MIN(createdAt), '%Y-%m') as cohortMonth,
          MIN(createdAt) as firstOrderDate,
          COUNT(*) as totalOrders,
          SUM(totalPrice) as lifetimeValue
        FROM \`Order\`
        WHERE tenantId = ${tenantId}
          AND customerShopifyId IS NOT NULL
          AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY customerShopifyId
      )
      SELECT 
        cohortMonth,
        COUNT(*) as newCustomers,
        SUM(CASE WHEN totalOrders > 1 THEN 1 ELSE 0 END) as returningCustomers,
        SUM(lifetimeValue) as totalRevenue,
        AVG(lifetimeValue) as avgLifetimeValue
      FROM first_orders
      GROUP BY cohortMonth
      ORDER BY cohortMonth DESC
      LIMIT 12
    `

    // Get retention rates by cohort
    const retentionData = await prisma.$queryRaw<{
      cohortMonth: string;
      month0: number;
      month1: number;
      month2: number;
      month3: number;
    }[]>`
      WITH cohorts AS (
        SELECT 
          customerShopifyId,
          DATE_FORMAT(MIN(createdAt), '%Y-%m') as cohortMonth
        FROM \`Order\`
        WHERE tenantId = ${tenantId}
          AND customerShopifyId IS NOT NULL
        GROUP BY customerShopifyId
      ),
      customer_orders AS (
        SELECT 
          o.customerShopifyId,
          c.cohortMonth,
          DATE_FORMAT(o.createdAt, '%Y-%m') as orderMonth,
          TIMESTAMPDIFF(MONTH, STR_TO_DATE(CONCAT(c.cohortMonth, '-01'), '%Y-%m-%d'), o.createdAt) as monthsAfterCohort
        FROM \`Order\` o
        JOIN cohorts c ON o.customerShopifyId = c.customerShopifyId
        WHERE o.tenantId = ${tenantId}
      )
      SELECT 
        cohortMonth,
        COUNT(DISTINCT CASE WHEN monthsAfterCohort = 0 THEN customerShopifyId END) as month0,
        COUNT(DISTINCT CASE WHEN monthsAfterCohort = 1 THEN customerShopifyId END) as month1,
        COUNT(DISTINCT CASE WHEN monthsAfterCohort = 2 THEN customerShopifyId END) as month2,
        COUNT(DISTINCT CASE WHEN monthsAfterCohort = 3 THEN customerShopifyId END) as month3
      FROM customer_orders
      WHERE cohortMonth >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m')
      GROUP BY cohortMonth
      ORDER BY cohortMonth DESC
    `

    // Convert to safe JSON format
    const cohorts = cohortData.map(cohort => ({
      month: cohort.cohortMonth,
      newCustomers: Number(cohort.newCustomers || 0),
      returningCustomers: Number(cohort.returningCustomers || 0),
      totalRevenue: Number(cohort.totalRevenue || 0),
      avgLifetimeValue: Number(cohort.avgLifetimeValue || 0),
      retentionRate: cohort.newCustomers > 0 ? (Number(cohort.returningCustomers) / Number(cohort.newCustomers)) * 100 : 0
    }))

    const retention = retentionData.map(row => ({
      cohortMonth: row.cohortMonth,
      month0: Number(row.month0 || 0),
      month1: Number(row.month1 || 0),
      month2: Number(row.month2 || 0),
      month3: Number(row.month3 || 0),
      retention1Month: row.month0 > 0 ? (Number(row.month1) / Number(row.month0)) * 100 : 0,
      retention2Month: row.month0 > 0 ? (Number(row.month2) / Number(row.month0)) * 100 : 0,
      retention3Month: row.month0 > 0 ? (Number(row.month3) / Number(row.month0)) * 100 : 0
    }))

    return NextResponse.json(safeJson({
      cohorts,
      retention,
      insights: {
        avgNewCustomersPerMonth: cohorts.length > 0 ? cohorts.reduce((sum, c) => sum + c.newCustomers, 0) / cohorts.length : 0,
        avgRetentionRate: retention.length > 0 ? retention.reduce((sum, r) => sum + r.retention1Month, 0) / retention.length : 0,
        topCohortMonth: cohorts.length > 0 ? cohorts.reduce((prev, current) => prev.totalRevenue > current.totalRevenue ? prev : current).month : null
      }
    }))
  } catch (error) {
    console.error('Customer cohorts query failed:', error)
    return NextResponse.json({
      cohorts: [],
      retention: [],
      insights: { avgNewCustomersPerMonth: 0, avgRetentionRate: 0, topCohortMonth: null }
    })
  }
}

