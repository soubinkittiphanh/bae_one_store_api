-- =============================================================================
-- Migration: Multi-Platform Master & Connected Platform Accounts
-- Supports: Facebook, TikTok, Shopee, Lazada, LINE, WhatsApp, etc.
-- =============================================================================

-- 1. platforms (Master Catalog)
CREATE TABLE IF NOT EXISTS `platforms` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `category` ENUM('SOCIAL_CHAT', 'ECOMMERCE_MARKETPLACE', 'MESSAGING_APP') NOT NULL DEFAULT 'SOCIAL_CHAT',
  `logoUrl` VARCHAR(500) NULL,
  `hasChat` TINYINT(1) NOT NULL DEFAULT 1,
  `hasOrderSync` TINYINT(1) NOT NULL DEFAULT 0,
  `hasInventorySync` TINYINT(1) NOT NULL DEFAULT 0,
  `hasProductSync` TINYINT(1) NOT NULL DEFAULT 0,
  `authType` ENUM('OAUTH2', 'API_KEY', 'WEBHOOK') NOT NULL DEFAULT 'OAUTH2',
  `apiBaseUrl` VARCHAR(255) NULL,
  `oauthAuthUrl` VARCHAR(255) NULL,
  `oauthTokenUrl` VARCHAR(255) NULL,
  `defaultMonthlyPrice` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_platforms_code` (`code`),
  KEY `idx_platforms_category` (`category`),
  KEY `idx_platforms_is_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. platform_accounts (Merchant's Connected Pages/Shops)
CREATE TABLE IF NOT EXISTS `platform_accounts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `platformId` INT NOT NULL,
  `externalAccountId` VARCHAR(150) NOT NULL,
  `accountName` VARCHAR(255) NOT NULL,
  `avatarUrl` VARCHAR(500) NULL,
  `accessToken` TEXT NULL,
  `refreshToken` TEXT NULL,
  `tokenExpiresAt` DATETIME NULL,
  `extraCredentials` JSON NULL,
  `isChatEnabled` TINYINT(1) NOT NULL DEFAULT 1,
  `isOrderSyncEnabled` TINYINT(1) NOT NULL DEFAULT 0,
  `isInventorySyncEnabled` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE', 'EXPIRED', 'DISCONNECTED', 'SUSPENDED_OVER_QUOTA') NOT NULL DEFAULT 'ACTIVE',
  `lastSyncedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_platform_external` (`companyId`, `platformId`, `externalAccountId`),
  KEY `idx_platform_external` (`platformId`, `externalAccountId`),
  KEY `idx_platform_account_company` (`companyId`),
  KEY `idx_platform_account_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Safely update `company` table with social quota fields
ALTER TABLE `company`
  ADD COLUMN IF NOT EXISTS `max_social_pages` INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS `social_plan_name` VARCHAR(50) NOT NULL DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS `social_plan_expires_at` DATETIME NULL;

-- 4. Initial Seed Platforms
INSERT INTO `platforms` (`code`, `name`, `category`, `logoUrl`, `hasChat`, `hasOrderSync`, `hasInventorySync`, `hasProductSync`, `authType`, `defaultMonthlyPrice`, `isActive`, `sortOrder`)
VALUES
  ('facebook', 'Facebook Messenger', 'SOCIAL_CHAT', 'https://upload.wikimedia.org/wikipedia/commons/b/b9/2023_Facebook_icon.svg', 1, 0, 0, 0, 'OAUTH2', 50000.00, 1, 1),
  ('tiktok', 'TikTok Business / Shop', 'SOCIAL_CHAT', 'https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg', 1, 1, 1, 1, 'OAUTH2', 50000.00, 1, 2),
  ('shopee', 'Shopee Open Platform', 'ECOMMERCE_MARKETPLACE', 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Shopee.svg', 1, 1, 1, 1, 'API_KEY', 100000.00, 1, 3),
  ('lazada', 'Lazada Open Platform', 'ECOMMERCE_MARKETPLACE', 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Lazada_%282019%29.svg', 1, 1, 1, 1, 'OAUTH2', 100000.00, 1, 4),
  ('line', 'LINE Official Account', 'MESSAGING_APP', 'https://upload.wikimedia.org/wikipedia/commons/4/41/LINE_logo.svg', 1, 0, 0, 0, 'API_KEY', 50000.00, 1, 5)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `category` = VALUES(`category`),
  `logoUrl` = VALUES(`logoUrl`),
  `hasChat` = VALUES(`hasChat`),
  `hasOrderSync` = VALUES(`hasOrderSync`),
  `hasInventorySync` = VALUES(`hasInventorySync`),
  `hasProductSync` = VALUES(`hasProductSync`),
  `authType` = VALUES(`authType`);
