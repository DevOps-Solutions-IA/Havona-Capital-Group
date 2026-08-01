import { PrismaClient } from '@prisma/client';
declare global { var havonaPrisma: PrismaClient | undefined; }
export const prisma = globalThis.havonaPrisma ?? new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
if (process.env.NODE_ENV !== 'production') globalThis.havonaPrisma = prisma;
export * from '@prisma/client';
