import { z } from "zod";

export const ViolationPayloadSchema = z.object({
  adId: z.string().min(1, "adId is required"),
  tenantId: z.string().min(1, "tenantId is required"),
  violationType: z.enum(
    ["PROHIBITED_TERM", "BRAND_VIOLATION", "COMPLIANCE_FAIL"],
    {
      errorMap: () => ({
        message:
          "violationType must be one of: PROHIBITED_TERM, BRAND_VIOLATION, COMPLIANCE_FAIL",
      }),
    }
  ),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"], {
    errorMap: () => ({
      message: "severity must be one of: LOW, MEDIUM, HIGH, CRITICAL",
    }),
  }),
  detectedAt: z
    .string()
    .datetime({ message: "detectedAt must be a valid ISO 8601 datetime" }),
});

export type ViolationPayload = z.infer<typeof ViolationPayloadSchema>;
