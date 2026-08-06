import { defineConfig, pluginMSW, pluginTSType, pluginZod } from "openapi-to";
export default defineConfig({
  servers: [{ name: "msw", input: { path: "fixtures/openapi30/main.yaml" }, output: { base: "workspace", dir: "scenarios/generators/generated/msw", clean: true } }],
  plugins: [pluginTSType(), pluginZod(), pluginMSW()],
});
