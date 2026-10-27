-- Bargain Experience Studio: shopkeeper personality, invitation design, and
-- separate draft/published snapshots. Additive only; existing configs keep the
-- defaults so prior storefront behavior is unchanged until a merchant publishes.
ALTER TABLE "BargainConfig"
  ADD COLUMN "shopkeeperPersonality" TEXT NOT NULL DEFAULT 'friendly_shopkeeper',
  ADD COLUMN "invitationDesign" TEXT NOT NULL DEFAULT 'smart-assistant',
  ADD COLUMN "avatarEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "motionEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "invitationCtaLabel" TEXT,
  ADD COLUMN "invitationCopy" TEXT,
  ADD COLUMN "invitationGreeting" TEXT,
  ADD COLUMN "invitationAccentColor" TEXT,
  ADD COLUMN "invitationAvatarSize" TEXT NOT NULL DEFAULT 'md',
  ADD COLUMN "invitationCompact" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "invitationPosition" TEXT NOT NULL DEFAULT 'bottom-right',
  ADD COLUMN "experienceLocale" TEXT NOT NULL DEFAULT 'store-default',
  ADD COLUMN "experienceSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "experiencePublishedVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "experienceDraftVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "experienceDraft" JSONB,
  ADD COLUMN "experiencePublished" JSONB;
