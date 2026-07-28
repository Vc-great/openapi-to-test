import { widgetMetadataSchema } from "./widget-metadata.schema.ts";
import { widgetDetailsSchema } from "./widget-details.schema.ts";
import { z } from "zod";
export const createWidgetRequestSchema = z.object({
  name: z.string(),
  status: z.enum(['active', 'archived']),
  tags: z.array(z.string()),
  metadata: z.lazy(() => widgetMetadataSchema).optional(),
  details: z.lazy(() => widgetDetailsSchema).optional()
});
