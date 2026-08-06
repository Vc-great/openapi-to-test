import { defineConfig, pluginTSType } from "openapi-to";

export default defineConfig({
  servers: [
    {
      name: "user-service",
      input: { path: "fixtures/multi-target/user.yaml" },
      output: { base: "workspace", dir: "scenarios/multi-target/generated/user", clean: true },
    },
    {
      name: "order-service",
      input: { path: "fixtures/multi-target/order.yaml" },
      output: { base: "workspace", dir: "scenarios/multi-target/generated/order", clean: true },
    },
    {
      name: "payment-service",
      input: { path: "fixtures/multi-target/payment.yaml" },
      output: { base: "workspace", dir: "scenarios/multi-target/generated/payment", clean: true },
    },
  ],
  plugins: [pluginTSType()],
});
