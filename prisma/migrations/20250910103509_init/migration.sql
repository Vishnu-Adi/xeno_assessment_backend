-- CreateTable
CREATE TABLE `Tenant` (
    `id` BINARY(16) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Store` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BINARY(16) NOT NULL,
    `shopDomain` VARCHAR(255) NOT NULL,
    `accessToken` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Store_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    UNIQUE INDEX `Store_tenantId_shopDomain_key`(`tenantId`, `shopDomain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BINARY(16) NOT NULL,
    `shopifyCustomerId` BIGINT NOT NULL,
    `email` VARCHAR(255) NULL,
    `firstName` VARCHAR(120) NULL,
    `lastName` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    UNIQUE INDEX `Customer_tenantId_shopifyCustomerId_key`(`tenantId`, `shopifyCustomerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BINARY(16) NOT NULL,
    `shopifyProductId` BIGINT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `price` DECIMAL(12, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Product_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    UNIQUE INDEX `Product_tenantId_shopifyProductId_key`(`tenantId`, `shopifyProductId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` BINARY(16) NOT NULL,
    `shopifyOrderId` BIGINT NOT NULL,
    `customerShopifyId` BIGINT NULL,
    `totalPrice` DECIMAL(12, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `status` ENUM('pending', 'fulfilled', 'cancelled') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Order_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `Order_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    UNIQUE INDEX `Order_tenantId_shopifyOrderId_key`(`tenantId`, `shopifyOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookEvent` (
    `tenantId` BINARY(16) NOT NULL,
    `eventId` VARCHAR(64) NOT NULL,
    `eventType` VARCHAR(64) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`tenantId`, `eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Store` ADD CONSTRAINT `Store_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookEvent` ADD CONSTRAINT `WebhookEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
