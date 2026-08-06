import {
  defineConfig,
  pluginSWR,
  pluginTSRequest,
  pluginTSType,
  pluginVueQuery,
  pluginZod,
} from "openapi-to";

export default defineConfig({
  servers: [{
    name: "init-template",
    input: { path: "fixtures/openapi30/main.yaml" },
    output: { base: "workspace", dir: "scenarios/cli/init-template-output", clean: true },
  }],
  plugins: [
    pluginSWR(),
    pluginVueQuery(),
    pluginZod(),
    pluginTSType(),
    pluginTSRequest({
      requestImportDeclaration: { moduleSpecifier: "@/utils/request" },
      requestConfigTypeImportDeclaration: {
        namedImports: ["AxiosRequestConfig"],
        moduleSpecifier: "axios",
      },
    }),
  ],
});
