import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const shop = url.searchParams.get('shop')
  
  if (!shop) {
    return NextResponse.json({ error: 'missing shop' }, { status: 400 })
  }

  // Mock product names for different tenants
  const tenantAProducts = [
    'Smartwatch Strap', 'Mini Phone Tripod', 'Card Wallet', 'Car Mobile Holder',
    'USB-C Cable', 'Shoulder Bag', 'Aviator Sunglasses', 'Laptop Sleeve',
    'Desk Mobile Stand', 'Power Bank', 'Bluetooth Speaker', 'LED Table Lamp',
    'Travel Neck Pillow', 'Coir Doormat', 'Coffee Mugs Set'
  ]
  
  const tenantBProducts = [
    'Steel Water Bottle', 'Double Bedsheet Set', 'Electric Kettle', 'Digital Kitchen Scale',
    'Glass Storage Jars', 'Folding Umbrella', 'Wireless Headphones', 'Ceramic Plant Pot',
    'Phone Stand', 'Yoga Mat', 'Hand Towel Set', 'Wall Clock'
  ]

  const products = shop.includes('tenant-a') ? tenantAProducts : tenantBProducts
  const isMainTenant = shop.includes('tenant-a')

  // Generate realistic sales data
  const productsWithSales = products.map((title, index) => {
    // Simulate decreasing popularity (first products sell more)
    const popularityFactor = Math.pow(0.85, index)
    const baseSales = isMainTenant ? 45 : 30 // Main tenant sells more
    const unitsSold = Math.floor(baseSales * popularityFactor * (0.5 + Math.random() * 0.5))
    const avgPrice = Math.random() * 80 + 30 // $30-110 average price
    const revenue = Math.round(unitsSold * avgPrice * 100) / 100

    return {
      id: `gid://shopify/Product/${1000 + index}`,
      title: title,
      inventory: Math.floor(Math.random() * 150) + 50, // 50-200 inventory
      updatedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
      status: 'ACTIVE',
      metrics: {
        units: unitsSold,
        revenue: revenue,
        views: unitsSold * (Math.floor(Math.random() * 10) + 5), // 5-15x views vs sales
        cartAdds: Math.floor(unitsSold * (1.2 + Math.random() * 0.6)), // 1.2-1.8x cart adds vs units sold
      }
    }
  })

  // Sort by revenue (highest first)
  const topProducts = productsWithSales.sort((a, b) => b.metrics.revenue - a.metrics.revenue)

  // Calculate counts
  const counts = {
    active: products.length,
    draft: 0,
    archived: 0,
  }

  // Generate realistic customer data
  const customerNames = [
    'Priya Sharma', 'Rahul Patel', 'Ananya Gupta', 'Karthik Nair', 'Diya Khan',
    'Rohan Singh', 'Meera Reddy', 'Arjun Iyer', 'Nisha Verma', 'Vikram Joshi'
  ]

  const topCustomers = customerNames.slice(0, isMainTenant ? 8 : 6).map((name, index) => {
    const orderCount = Math.floor(Math.random() * 4) + 1 // 1-4 orders
    const avgOrderValue = Math.random() * 200 + 80 // $80-280 per order  
    const totalSpend = Math.round(orderCount * avgOrderValue * 100) / 100

    return {
      id: `${1000 + index}`,
      name: name,
      email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
      totalSpend: totalSpend,
      orderCount: orderCount,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      lastOrderAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Random date in last 30 days
    }
  }).sort((a, b) => b.totalSpend - a.totalSpend)

  // Calculate insights
  const totalRevenue = topProducts.reduce((sum, p) => sum + p.metrics.revenue, 0)
  const totalUnits = topProducts.reduce((sum, p) => sum + p.metrics.units, 0)
  const totalOrders = topCustomers.reduce((sum, c) => sum + c.orderCount, 0)

  console.log(`[Mock Products API] Generated ${topProducts.length} products with ${totalUnits} total units sold, ${totalRevenue.toFixed(2)} revenue`)

  return NextResponse.json({ 
    counts, 
    lowStock: [], 
    top: topProducts,
    customers: topCustomers,
    insights: {
      totalProducts: products.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders: totalOrders,
      totalCustomers: topCustomers.length
    }
  })
}

