import {
defineConfig,
pluginTSRequest,
pluginTSType, 
pluginZod
   } from'openapi-to'

export default  defineConfig({
servers:[
  {
    input: {
      path:'fixtures/openapi30/main.yaml'
    },
    output:{
       dir:'server'
    }
  }
],
  plugins:[
    pluginZod(),
    pluginTSType(),
    pluginTSRequest({
      requestImportDeclaration: {
        moduleSpecifier: '@/utils/request',
      },
      requestConfigTypeImportDeclaration: {
        namedImports: ['AxiosRequestConfig'],
        moduleSpecifier: 'axios',
      },
    })
  ]
})
