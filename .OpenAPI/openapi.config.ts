import {
  defineConfig,
  pluginTSRequest,
  pluginTSType,
  pluginZod,
} from "openapi-to";

export default defineConfig({
  servers: [
    {
      name: "manual-full",
      input: {
        path: "./fixtures/basic/openapi.yaml",
      },
      output: {
        base: "workspace",
        dir: "src/api/generated/manual-full",
        clean: true,
      },
    },
  ],
  plugins: [
    pluginTSType({
      importWithExtension: true,
    }),
    pluginZod({
      importWithExtension: true,
    }),
    pluginTSRequest({
      requestClient: "common",
      requestImportDeclaration: {
        moduleSpecifier: "../../../request.ts",
      },
      requestConfigTypeImportDeclaration: {
        namedImports: ["RequestOptions"],
        moduleSpecifier: "../../../request.ts",
      },
      importWithExtension: true,
    }),
  ],
});
