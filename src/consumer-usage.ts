import { createWidgetService } from "./api/generated/manual-full/widgets/create-widget.service.ts";
import type { CreateWidgetMutationRequest } from "./api/generated/manual-full/widgets/create-widget.types.ts";
import { getWidgetService } from "./api/generated/manual-full/widgets/get-widget.service.ts";
import type { WidgetModel as Widget } from "./api/generated/manual-full/types/models/widget.model.ts";

const createWidgetInput = {
  name: "Verification widget",
  status: "active",
  tags: ["consumer", "manual-full"],
  metadata: {
    labels: ["fixture"],
    owner: "verification-suite",
    audit: {
      createdAt: "2026-07-28T00:00:00.000Z",
    },
  },
  details: {
    category: "premium",
    stockCount: 7,
  },
} satisfies CreateWidgetMutationRequest;

export async function exerciseGeneratedClient(): Promise<{
  fetched: Widget;
  created: Widget;
}> {
  const fetched: Widget = await getWidgetService("widget-123", {
    includeDetails: true,
  });
  const created: Widget = await createWidgetService(createWidgetInput);

  const nestedAuditTimestamp: string = fetched.metadata.audit.createdAt;
  const allowedStatus: "active" | "archived" = created.status;
  const tags: string[] = created.tags;

  void nestedAuditTimestamp;
  void allowedStatus;
  void tags;

  return { fetched, created };
}
