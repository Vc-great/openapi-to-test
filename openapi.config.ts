import {
defineConfig,
pluginSWR, 
pluginTSRequest,
pluginTSType, 
pluginZod
   } from'openapi-to'

export default  defineConfig({
servers:[
  {
    input: {
      path:'https://petstore.swagger.io/v2/swagger.json'  //api documentation url
    },
    output:{
       dir:'server'
    }
  }
],
  plugins:[
    pluginSWR(),
    // SWR and Vue Query are alternative query plugins that emit the same paths.
    // Import pluginVueQuery and replace pluginSWR() when using Vue Query.
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