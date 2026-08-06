import { userSchema } from "../scenarios/generators/generated/zod/zod/models/user.schema.ts";

const valid = userSchema.safeParse({
  id: "u1",
  name: "Alice",
  role: "admin",
  optionalInline: { count: 2, mode: "fast" },
});
const invalid = userSchema.safeParse({
  name: "Missing id",
  role: "member",
  optionalInline: { mode: "slow" },
});

if (!valid.success) {
  throw new Error(`Zod rejected a valid fixture: ${valid.error.message}`);
}
if (invalid.success) {
  throw new Error("Zod accepted an invalid fixture");
}
