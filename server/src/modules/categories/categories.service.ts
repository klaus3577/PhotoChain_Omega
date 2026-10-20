// A kategóriák: a nyilvános lista és a hivatkozott kategória ellenőrzése (feltöltés, módosítás).
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';

export interface CategoryDto {
  id: number;
  name: string;
  /** URL-barát azonosító, pl. „etel-es-ital” */
  slug: string;
}

/** A kategóriák név szerint rendezve (a név egyedi, így a sorrend egyértelmű). */
export function listCategories(prisma: PrismaClient): Promise<CategoryDto[]> {
  return prisma.category.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });
}

/** Ha a kategória nem létezik, a mező megnevezésével 400-as hibát dob. */
export async function assertCategoryExists(
  prisma: PrismaClient,
  categoryId: number,
): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', [
      { path: 'categoryId', message: 'ismeretlen kategória' },
    ]);
  }
}
