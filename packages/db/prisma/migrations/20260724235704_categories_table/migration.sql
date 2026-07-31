-- SM-99: expense categories move from a fixed enum to a data table (system/custom hybrid).
-- Data-preserving: existing Expense/VendorRule enum values become TEXT keys 1:1, seeded into Category
-- BEFORE the FK is added. System categories (ADS/ACTORS/SALARY/HONORAR/BANK_FEES) are load-bearing.

-- 1. Category kind (keeps P&L grouping stable across custom categories)
CREATE TYPE "CategoryKind" AS ENUM ('OPERATING', 'BILLABLE', 'PAYROLL', 'BANK');

-- 2. Category table
CREATE TABLE "Category" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "kind" "CategoryKind" NOT NULL DEFAULT 'OPERATING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("key")
);

-- 3. Seed the 13 existing categories (labels match the previous CATEGORY_LABEL map)
INSERT INTO "Category" ("key", "label", "system", "kind", "sortOrder") VALUES
    ('OPERATIONS',     'Оперативни',           false, 'OPERATING', 10),
    ('ADS',            'Реклами (Meta)',       true,  'BILLABLE',  20),
    ('ACTORS',         'Актери',               true,  'BILLABLE',  30),
    ('EQUIPMENT',      'Опрема',               false, 'OPERATING', 40),
    ('FUEL',           'Гориво',               false, 'OPERATING', 50),
    ('RENT',           'Кирија',               false, 'OPERATING', 60),
    ('UTILITIES',      'Комуналии',            false, 'OPERATING', 70),
    ('PHONE',          'Телефон / интернет',   false, 'OPERATING', 80),
    ('BANK_FEES',      'Банкарски провизии',   true,  'BANK',      90),
    ('SALARY',         'Плата',                true,  'PAYROLL',   100),
    ('HONORAR',        'Хонорар',              true,  'PAYROLL',   110),
    ('REPRESENTATION', 'Кафани / ресторани',   false, 'OPERATING', 120),
    ('MARKETING',      'Маркетинг',            false, 'OPERATING', 130),
    ('OTHER',          'Друго',                false, 'OPERATING', 140);

-- 4. Convert the enum columns to TEXT (values are valid keys, preserved via ::text)
ALTER TABLE "Expense" ALTER COLUMN "category" SET DATA TYPE TEXT USING "category"::text;
ALTER TABLE "VendorRule" ALTER COLUMN "category" SET DATA TYPE TEXT USING "category"::text;

-- 5. Referential integrity (a category in use cannot be deleted — onDelete: Restrict)
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_category_fkey"
    FOREIGN KEY ("category") REFERENCES "Category"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorRule" ADD CONSTRAINT "VendorRule_category_fkey"
    FOREIGN KEY ("category") REFERENCES "Category"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Drop the old enum type
DROP TYPE "ExpenseCategory";
