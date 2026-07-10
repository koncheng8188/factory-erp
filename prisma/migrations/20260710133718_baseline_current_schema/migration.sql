-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "specification" TEXT,
    "material" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "surfaceTreatment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductPart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "partCode" TEXT,
    "specification" TEXT,
    "material" TEXT,
    "unitQuantity" INTEGER NOT NULL DEFAULT 1,
    "productQuantity" INTEGER NOT NULL DEFAULT 1,
    "totalQuantity" INTEGER NOT NULL DEFAULT 1,
    "surfaceTreatment" TEXT,
    "color" TEXT,
    "outsourcedQuantity" INTEGER NOT NULL DEFAULT 0,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "missingQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductPart_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductPartProgressLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productPartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPartProgressLog_productPartId_fkey" FOREIGN KEY ("productPartId") REFERENCES "ProductPart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductPartProgressLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductPartProgressLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductPartAbnormal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productPartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" DATETIME,
    "resolvedRemark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductPartAbnormal_productPartId_fkey" FOREIGN KEY ("productPartId") REFERENCES "ProductPart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductPartAbnormal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductPartAbnormal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartDrawing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "originalUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "printThumbnailUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "uploadStatus" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartDrawing_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartDrawing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartDrawing_partId_fkey" FOREIGN KEY ("partId") REFERENCES "ProductPart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutsourceOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outsourceNo" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "outsourceType" TEXT NOT NULL,
    "outsourceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnDate" DATETIME,
    "actualReturnDate" DATETIME,
    "handler" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OutsourceOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outsourceOrderId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "drawingId" TEXT,
    "partName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "surfaceTreatment" TEXT,
    "color" TEXT,
    "outsourceQuantity" INTEGER NOT NULL DEFAULT 0,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "missingQuantity" INTEGER NOT NULL DEFAULT 0,
    "thumbnailUrl" TEXT,
    "originalUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OUTSOURCED',
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutsourceOrderItem_outsourceOrderId_fkey" FOREIGN KEY ("outsourceOrderId") REFERENCES "OutsourceOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutsourceOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutsourceOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutsourceOrderItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "ProductPart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutsourceOrderItem_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "PartDrawing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutsourceReturn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outsourceOrderId" TEXT NOT NULL,
    "returnDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handler" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutsourceReturn_outsourceOrderId_fkey" FOREIGN KEY ("outsourceOrderId") REFERENCES "OutsourceOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutsourceReturnItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outsourceReturnId" TEXT NOT NULL,
    "outsourceOrderItemId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "returnQuantity" INTEGER NOT NULL DEFAULT 0,
    "abnormalQuantity" INTEGER NOT NULL DEFAULT 0,
    "abnormalReason" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutsourceReturnItem_outsourceReturnId_fkey" FOREIGN KEY ("outsourceReturnId") REFERENCES "OutsourceReturn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutsourceReturnItem_outsourceOrderItemId_fkey" FOREIGN KEY ("outsourceOrderItemId") REFERENCES "OutsourceOrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutsourceReturnItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "ProductPart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "deliveryDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiver" TEXT,
    "handler" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryOrderId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "specification" TEXT,
    "deliveryQuantity" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryOrderItem_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Product_orderId_idx" ON "Product"("orderId");

-- CreateIndex
CREATE INDEX "ProductPart_orderId_idx" ON "ProductPart"("orderId");

-- CreateIndex
CREATE INDEX "ProductPart_productId_idx" ON "ProductPart"("productId");

-- CreateIndex
CREATE INDEX "ProductPart_partCode_idx" ON "ProductPart"("partCode");

-- CreateIndex
CREATE INDEX "ProductPartProgressLog_occurredAt_idx" ON "ProductPartProgressLog"("occurredAt");

-- CreateIndex
CREATE INDEX "ProductPartProgressLog_orderId_idx" ON "ProductPartProgressLog"("orderId");

-- CreateIndex
CREATE INDEX "ProductPartProgressLog_productId_idx" ON "ProductPartProgressLog"("productId");

-- CreateIndex
CREATE INDEX "ProductPartProgressLog_productPartId_idx" ON "ProductPartProgressLog"("productPartId");

-- CreateIndex
CREATE INDEX "ProductPartProgressLog_toStatus_occurredAt_idx" ON "ProductPartProgressLog"("toStatus", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductPartAbnormal_status_createdAt_idx" ON "ProductPartAbnormal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductPartAbnormal_orderId_idx" ON "ProductPartAbnormal"("orderId");

-- CreateIndex
CREATE INDEX "ProductPartAbnormal_productId_idx" ON "ProductPartAbnormal"("productId");

-- CreateIndex
CREATE INDEX "ProductPartAbnormal_productPartId_idx" ON "ProductPartAbnormal"("productPartId");

-- CreateIndex
CREATE INDEX "PartDrawing_orderId_idx" ON "PartDrawing"("orderId");

-- CreateIndex
CREATE INDEX "PartDrawing_productId_idx" ON "PartDrawing"("productId");

-- CreateIndex
CREATE INDEX "PartDrawing_partId_idx" ON "PartDrawing"("partId");

-- CreateIndex
CREATE INDEX "PartDrawing_partId_status_isMain_idx" ON "PartDrawing"("partId", "status", "isMain");

-- CreateIndex
CREATE UNIQUE INDEX "OutsourceOrder_outsourceNo_key" ON "OutsourceOrder"("outsourceNo");

-- CreateIndex
CREATE INDEX "OutsourceOrderItem_outsourceOrderId_idx" ON "OutsourceOrderItem"("outsourceOrderId");

-- CreateIndex
CREATE INDEX "OutsourceOrderItem_orderId_idx" ON "OutsourceOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OutsourceOrderItem_productId_idx" ON "OutsourceOrderItem"("productId");

-- CreateIndex
CREATE INDEX "OutsourceOrderItem_partId_idx" ON "OutsourceOrderItem"("partId");

-- CreateIndex
CREATE INDEX "OutsourceOrderItem_drawingId_idx" ON "OutsourceOrderItem"("drawingId");

-- CreateIndex
CREATE INDEX "OutsourceReturn_outsourceOrderId_idx" ON "OutsourceReturn"("outsourceOrderId");

-- CreateIndex
CREATE INDEX "OutsourceReturnItem_outsourceReturnId_idx" ON "OutsourceReturnItem"("outsourceReturnId");

-- CreateIndex
CREATE INDEX "OutsourceReturnItem_outsourceOrderItemId_idx" ON "OutsourceReturnItem"("outsourceOrderItemId");

-- CreateIndex
CREATE INDEX "OutsourceReturnItem_partId_idx" ON "OutsourceReturnItem"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_deliveryNo_key" ON "DeliveryOrder"("deliveryNo");

-- CreateIndex
CREATE INDEX "DeliveryOrder_orderId_idx" ON "DeliveryOrder"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_customerId_idx" ON "DeliveryOrder"("customerId");

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_deliveryOrderId_idx" ON "DeliveryOrderItem"("deliveryOrderId");

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_orderId_idx" ON "DeliveryOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_productId_idx" ON "DeliveryOrderItem"("productId");
