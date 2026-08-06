import { defineConfig, pluginTSType } from "openapi-to";
export default defineConfig({
  servers: [{ name: "ts-type", input: { path: "fixtures/openapi30/main.yaml" }, output: { base: "workspace", dir: "scenarios/generators/generated/ts-type", clean: true } }],
  plugins: [pluginTSType()],
});
