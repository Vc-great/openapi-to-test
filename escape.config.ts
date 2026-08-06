import { defineConfig, pluginTSType } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "escape",
    input: { path: "fixtures/openapi30/main.yaml" },
    output: { base: "workspace", dir: "../escaped", clean: true },
  }],
  plugins: [pluginTSType()],
});
