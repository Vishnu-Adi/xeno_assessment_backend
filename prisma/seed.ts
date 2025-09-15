import { PrismaClient, Prisma } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

function uuid16() {
  return Buffer.from(crypto.randomUUID().replace(/-/g, ''), 'hex')
}

async function main() {
  const tenantA = uuid16()
  const tenantB = uuid16()

  await prisma.tenant.createMany({
    data: [
      { id: tenantA, name: 'Tenant A' },
      { id: tenantB, name: 'Tenant B' }
    ],
    skipDuplicates: true
  })

  // minimal sample rows for Tenant A
  await prisma.customer.create({
    data: {
      tenantId: tenantA,
      shopifyCustomerId: BigInt(1),
      email: 'a@example.com',
      firstName: 'A',
      lastName: 'One'
    }
  })

  await prisma.product.create({
    data: {
      tenantId: tenantA,
      shopifyProductId: BigInt(1001),
      title: 'Sample Product',
      price: new Prisma.Decimal(9.99)
    }
  })

  await prisma.order.create({
    data: {
      tenantId: tenantA,
      shopifyOrderId: BigInt(5001),
      totalPrice: new Prisma.Decimal(12.34),
      currency: 'USD',
      status: 'pending',
      createdAt: new Date()
    }
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
