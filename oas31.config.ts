import { defineConfig, pluginTSType, pluginZod } from "openapi-to";
export default defineConfig({
  servers: [{
    name: "oas31",
    input: { path: "fixtures/openapi31/schema.json" },
    output: { base: "workspace", dir: "scenarios/generators/generated/oas31", clean: true },
  }],
  plugins: [pluginTSType(), pluginZod()],
});
