import { getUserService } from "../generated/ts-request/users/get-user.service.ts";
void getUserService;

void getUserService("consumer-id", undefined, {
  headers: { "X-Tenant": "tenant-from-client-config" },
  withCredentials: true,
  withXSRFToken: true,
});
