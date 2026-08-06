import { defineConfig, pluginMSW, pluginTSType, pluginZod } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "msw-minimal",
    input: { path: "fixtures/isolation/msw-schema-less.yaml" },
    output: {
      base: "workspace",
      dir: "scenarios/generators/generated/msw-minimal",
      clean: true,
    },
  }],
  plugins: [pluginTSType(), pluginZod(), pluginMSW()],
});
