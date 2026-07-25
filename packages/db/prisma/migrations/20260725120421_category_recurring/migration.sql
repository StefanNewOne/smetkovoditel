-- SM-100: mark fixed monthly overhead categories as recurring (ТЕКОВНИ ТРОШОЦИ screen) and add a
-- "Претплати / Системи" (subscriptions/servers) recurring category.

-- 1. New flag
ALTER TABLE "Category" ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT false;

-- 2. Default recurring overhead
UPDATE "Category" SET "recurring" = true WHERE "key" IN ('RENT', 'UTILITIES', 'PHONE', 'SALARY');

-- 3. New subscriptions/systems category (recurring)
INSERT INTO "Category" ("key", "label", "system", "kind", "sortOrder", "active", "recurring")
VALUES ('SUBSCRIPTIONS', 'Претплати / Системи', false, 'OPERATING', 135, true, true)
ON CONFLICT ("key") DO NOTHING;
