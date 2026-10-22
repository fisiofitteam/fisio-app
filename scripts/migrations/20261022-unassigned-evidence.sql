-- Allow uploading before choosing a client. Existing associations remain intact.
ALTER TABLE "PatientEvidence" ALTER COLUMN "patientId" DROP NOT NULL;
