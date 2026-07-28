import { widgetSchema } from "../zod/models/widget.schema.ts";
import { z } from "zod";
export const getWidgetPathParamsSchema = z.object({
  /**
   * @description Unique widget identifier
   */
  widgetId: z.string()
});
export const getWidgetQueryParamsSchema = z.object({
  /**
   * @description Include extended details in the response
   */
  includeDetails: z.boolean().optional()
});
/**
 * @description The requested widget
 */
export const getWidgetResponseSchema = widgetSchema;
export const getWidgetResponseErrorSchema = z.unknown();
