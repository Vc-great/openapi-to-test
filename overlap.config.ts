import { defineConfig, pluginTSType } from "openapi-to";

export default defineConfig({
  servers: [
    {
      name: "parent",
      input: { path: "fixtures/multi-target/user.yaml" },
      output: { base: "workspace", dir: "generated", clean: true },
    },
    {
      name: "child",
      input: { path: "fixtures/multi-target/order.yaml" },
      output: { base: "workspace", dir: "generated/nested", clean: true },
    },
  ],
  plugins: [pluginTSType()],
});
