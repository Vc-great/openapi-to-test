import {
  defineConfig,
  pluginSWR,
  pluginTSRequest,
  pluginTSType,
  pluginZod,
} from "openapi-to";

export default defineConfig({
  servers: [{
    name: "swr-minimal",
    input: { path: "fixtures/isolation/swr-minimal.yaml" },
    output: {
      base: "workspace",
      dir: "scenarios/generators/generated/swr-minimal",
      clean: true,
    },
  }],
  plugins: [
    pluginTSType(),
    pluginZod(),
    pluginTSRequest({ requestClient: "axios" }),
    pluginSWR(),
  ],
});
