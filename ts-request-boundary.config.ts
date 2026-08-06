import { defineConfig, pluginTSRequest, pluginTSType } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "ts-request-boundary",
    input: { path: "fixtures/isolation/request-config-boundary.yaml" },
    output: {
      base: "workspace",
      dir: "scenarios/generators/generated/ts-request-boundary",
      clean: true,
    },
  }],
  plugins: [pluginTSType(), pluginTSRequest({ requestClient: "axios" })],
});
