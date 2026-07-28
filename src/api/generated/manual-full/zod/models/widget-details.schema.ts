import { z } from "zod";
export const widgetDetailsSchema = z.object({
  category: z.enum(['basic', 'premium']),
  /**
   * @minimum 0- undefined≥0
   */
  stockCount: z.number().int().min(0)
});
