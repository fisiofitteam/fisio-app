-- Nullable overrides preserve every existing amber selection and historical WOD.
ALTER TABLE "PatientCategoryLevel" ADD COLUMN IF NOT EXISTS "redCategoryLevelId" TEXT;
ALTER TABLE "PatientCategoryLevel" ADD COLUMN IF NOT EXISTS "greenCategoryLevelId" TEXT;
ALTER TABLE "WodLog" ADD COLUMN IF NOT EXISTS "readiness" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PatientCategoryLevel_redCategoryLevelId_fkey') THEN
    ALTER TABLE "PatientCategoryLevel" ADD CONSTRAINT "PatientCategoryLevel_redCategoryLevelId_fkey"
      FOREIGN KEY ("redCategoryLevelId") REFERENCES "CategoryLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PatientCategoryLevel_greenCategoryLevelId_fkey') THEN
    ALTER TABLE "PatientCategoryLevel" ADD CONSTRAINT "PatientCategoryLevel_greenCategoryLevelId_fkey"
      FOREIGN KEY ("greenCategoryLevelId") REFERENCES "CategoryLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WodLog_readiness_check') THEN
    ALTER TABLE "WodLog" ADD CONSTRAINT "WodLog_readiness_check" CHECK ("readiness" IS NULL OR "readiness" IN ('RED','AMBER','GREEN'));
  END IF;
END $$;
