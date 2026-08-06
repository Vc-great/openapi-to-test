import { defineConfig, pluginTSRequest, pluginTSType } from "openapi-to";
export default defineConfig({
  servers: [{ name: "ts-request", input: { path: "fixtures/openapi30/main.yaml" }, output: { base: "workspace", dir: "scenarios/generators/generated/ts-request", clean: true } }],
  plugins: [pluginTSType(), pluginTSRequest({ requestClient: "axios" })],
});
