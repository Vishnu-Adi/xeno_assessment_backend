import crypto from 'crypto';

export type TenantScope = { tenantId: Buffer };

export function parseUuidToBuffer(uuid: string): Buffer {
  // Accepts 32 or 36 char UUID; strips dashes and converts to Buffer(16)
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error('UUID must be 16 bytes');
  return Buffer.from(hex, 'hex');
}

export function generateTenantId(): Buffer {
  return crypto.randomBytes(16);
}

// Placeholder: resolve tenant from shop domain or session
export async function resolveTenantIdFromShopDomain(shopDomain: string): Promise<Buffer> {
  // In a real app, look up in Store table to get tenantId by shopDomain
  // Here we expect middleware to provide it; stub to avoid tight coupling.
  // For now, derive a deterministic 16-byte ID from the shopDomain hash.
  const hash = crypto.createHash('sha256').update(shopDomain).digest();
  return hash.subarray(0, 16);
}


