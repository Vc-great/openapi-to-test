import { defineConfig, pluginTSRequest, pluginTSType, pluginVueQuery } from "openapi-to";
export default defineConfig({
  servers: [{ name: "vue-query", input: { path: "fixtures/openapi30/main.yaml" }, output: { base: "workspace", dir: "scenarios/generators/generated/vue-query", clean: true } }],
  plugins: [pluginTSType(), pluginTSRequest({ requestClient: "axios" }), pluginVueQuery()],
});
