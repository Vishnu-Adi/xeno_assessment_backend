import { Product, PrismaClient, Prisma } from '@prisma/client';
import { getPrisma } from '@/lib/db';
import { TenantScope } from '@/lib/tenant';

export async function listProducts(scope: TenantScope, params: { limit?: number; cursor?: string }) {
  const prisma = getPrisma();
  const take = Math.min(params.limit ?? 25, 100);
  const cursor = params.cursor ? { id: BigInt(params.cursor) } : undefined;
  const items = await prisma.product.findMany({
    where: { tenantId: scope.tenantId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor, skip: 1 } : {}),
  });
  let nextCursor: string | null = null;
  if (items.length > take) {
    const next = items.pop()!;
    nextCursor = String(next.id);
  }
  return { items, nextCursor };
}

export async function upsertFromShopify(
  scope: TenantScope,
  payload: { id: string; title?: string; created_at?: string },
  client?: PrismaClient | Prisma.TransactionClient
): Promise<Product> {
  const prisma = (client ?? getPrisma());
  return prisma.product.upsert({
    where: { tenantId_shopifyProductId: { tenantId: scope.tenantId, shopifyProductId: BigInt(payload.id) } },
    update: {
      title: payload.title ?? 'Untitled',
    },
    create: {
      tenantId: scope.tenantId,
      shopifyProductId: BigInt(payload.id),
      title: payload.title ?? 'Untitled',
      createdAt: payload.created_at ? new Date(payload.created_at) : undefined,
    },
  });
}


