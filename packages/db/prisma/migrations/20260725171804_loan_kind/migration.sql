-- SM-102: loan kind (примена/поврат/дадена/наплата). Backfill existing rows from bank direction.
CREATE TYPE "LoanKind" AS ENUM ('RECEIVED', 'REPAID', 'GIVEN', 'COLLECTED');
ALTER TABLE "LoanEntry" ADD COLUMN "kind" "LoanKind" NOT NULL DEFAULT 'RECEIVED';
UPDATE "LoanEntry" SET "kind" = 'REPAID' WHERE "direction" = 'OUT';
