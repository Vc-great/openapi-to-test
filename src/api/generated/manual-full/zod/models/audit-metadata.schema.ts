import { z } from "zod";
export const auditMetadataSchema = z.object({
  /**
   * @format date-time
   */
  createdAt: z.string().datetime(),
  /**
   * @format date-time
   */
  updatedAt: z.string().datetime().optional()
});
