import { defineConfig, pluginSWR, pluginTSRequest, pluginTSType, pluginZod } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "swr-api",
    input: { path: "fixtures/openapi30/main.yaml" },
    output: {
      base: "workspace",
      dir: "scenarios/generators/generated/swr",
      clean: true,
    },
  }],
  plugins: [
    pluginTSType(),
    pluginZod(),
    pluginTSRequest({
      requestImportDeclaration: { moduleSpecifier: "@/utils/request" },
      requestConfigTypeImportDeclaration: {
        namedImports: ["AxiosRequestConfig"],
        moduleSpecifier: "axios",
      },
    }),
    pluginSWR(),
  ],
});
