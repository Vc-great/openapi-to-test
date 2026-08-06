import { defineConfig, pluginTSType } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "mcp-api",
    input: { path: "fixtures/openapi30/main.yaml" },
    output: { base: "workspace", dir: "scenarios/mcp/generated", clean: true },
  }],
  plugins: [pluginTSType()],
});
