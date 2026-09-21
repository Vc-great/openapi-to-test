import {
  defineConfig,
  pluginReactQuery,
  pluginTSRequest,
  pluginTSType,
} from "openapi-to";

export default defineConfig({
  servers: [{
    name: "react-query",
    input: { path: "fixtures/acceptance/react-query-user.yaml" },
    output: { base: "workspace", dir: "scenarios/generators/generated/react-query", clean: true },
  }],
  plugins: [
    pluginTSType(),
    pluginTSRequest({
      requestImportDeclaration: { moduleSpecifier: "@/utils/request" },
      requestConfigTypeImportDeclaration: {
        namedImports: ["AxiosRequestConfig"],
        moduleSpecifier: "axios",
      },
    }),
    pluginReactQuery({
      requestConfigTypeImportDeclaration: {
        namedImports: ["AxiosRequestConfig"],
        moduleSpecifier: "axios",
      },
      responseErrorTypeImportDeclaration: {
        namedImports: ["AxiosError"],
        moduleSpecifier: "axios",
      },
    }),
  ],
});
