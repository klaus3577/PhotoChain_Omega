-- L14: egy vevőnek egy képre legfeljebb egy élő (PENDING vagy PAID) rendelése lehet – a párhuzamos
-- fizetésindítás sem hozhat létre kettőt. A lezárt (EXPIRED, FAILED) rendelések nem számítanak.
-- (Előállítva: prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script)

-- CreateIndex
CREATE UNIQUE INDEX "orders_buyerId_photoId_live_key" ON "orders"("buyerId", "photoId") WHERE (status IN ('PENDING', 'PAID'));
