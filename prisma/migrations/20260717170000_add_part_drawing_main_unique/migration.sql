CREATE UNIQUE INDEX "PartDrawing_partId_main_key"
ON "PartDrawing"("partId")
WHERE "isMain" = 1;
