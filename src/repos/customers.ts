import { Customer, PrismaClient, Prisma } from '@prisma/client';
import { getPrisma } from '@/lib/db';
import { TenantScope } from '@/lib/tenant';

export async function listCustomers(scope: TenantScope, params: { from?: Date; to?: Date; limit?: number; cursor?: string }) {
  const prisma = getPrisma();
  const take = Math.min(params.limit ?? 25, 100);
  const where = {
    tenantId: scope.tenantId,
    ...(params.from || params.to
      ? { createdAt: { gte: params.from, lte: params.to } }
      : {}),
  } as const;
  const cursor = params.cursor ? { id: BigInt(params.cursor) } : undefined;
  const items = await prisma.customer.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, ...(cursor ? { cursor, skip: 1 } : {}) });
  let nextCursor: string | null = null;
  if (items.length > take) {
    const next = items.pop()!;
    nextCursor = String(next.id);
  }
  return { items, nextCursor };
}

export async function upsertFromShopify(
  scope: TenantScope,
  payload: { id: string; email?: string; first_name?: string; last_name?: string; created_at?: string },
  client?: PrismaClient | Prisma.TransactionClient
): Promise<Customer> {
  const prisma = (client ?? getPrisma());
  return prisma.customer.upsert({
    where: { tenantId_shopifyCustomerId: { tenantId: scope.tenantId, shopifyCustomerId: BigInt(payload.id) } },
    update: {
      email: payload.email ?? null,
      firstName: payload.first_name ?? null,
      lastName: payload.last_name ?? null,
    },
    create: {
      tenantId: scope.tenantId,
      shopifyCustomerId: BigInt(payload.id),
      email: payload.email ?? null,
      firstName: payload.first_name ?? null,
      lastName: payload.last_name ?? null,
      createdAt: payload.created_at ? new Date(payload.created_at) : undefined,
    },
  });
}


