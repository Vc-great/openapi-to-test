import { getUserService } from "../generated/ts-request-boundary/users/get-user.service.ts";

void getUserService("consumer-id", {
  headers: { "X-Tenant": "tenant-from-client-config" },
  withCredentials: true,
  withXSRFToken: true,
});
