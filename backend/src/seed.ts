import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
try {
  await prisma.user.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000001', name: 'Demo uporabnik', email: 'demo@roomflow.local' },
  });
  for (const room of [
    { id: '00000000-0000-4000-8000-000000000002', name: 'Soba A', building: 'Stavba A', floor: 1, capacity: 6, equipment: 'Projektor, TV' },
    { id: '00000000-0000-4000-8000-000000000003', name: 'Soba B', building: 'Stavba B', floor: 2, capacity: 12, equipment: 'Tabla' },
  ]) {
    await prisma.room.upsert({ where: { id: room.id }, update: {}, create: room });
  }
} finally {
  await prisma.$disconnect();
}
