import { auditMetadataSchema } from "./audit-metadata.schema.ts";
import { z } from "zod";
export const widgetMetadataSchema = z.object({
  labels: z.array(z.string()),
  owner: z.string().optional(),
  audit: z.lazy(() => auditMetadataSchema)
});
