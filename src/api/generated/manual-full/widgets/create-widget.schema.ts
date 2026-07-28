import { createWidgetRequestSchema } from "../zod/models/create-widget-request.schema.ts";
import { widgetSchema } from "../zod/models/widget.schema.ts";
import { z } from "zod";
export const createWidgetMutationRequestSchema = createWidgetRequestSchema;
/**
 * @description The created widget
 */
export const createWidgetMutationSchemaResponseSchema = widgetSchema;
