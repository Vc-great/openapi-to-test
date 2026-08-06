import { defineConfig, pluginTSType, pluginZod } from "openapi-to";
export default defineConfig({
  servers: [{ name: "zod", input: { path: "fixtures/openapi30/main.yaml" }, output: { base: "workspace", dir: "scenarios/generators/generated/zod", clean: true } }],
  plugins: [pluginTSType(), pluginZod()],
});
