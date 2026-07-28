import { widgetMetadataSchema } from "./widget-metadata.schema.ts";
import { widgetDetailsSchema } from "./widget-details.schema.ts";
import { z } from "zod";
export const widgetSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['active', 'archived']),
  tags: z.array(z.string()),
  metadata: z.lazy(() => widgetMetadataSchema),
  details: z.lazy(() => widgetDetailsSchema).optional()
});
