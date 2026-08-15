import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })
await build({
  entryPoints: ['src/client.tsx'],
  bundle: true,
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-runtime/client'],
  // __ModuleLoader__ 契约：factory 只接收 require，CJS 前奏（module/exports 声明）必须在
  // factory 闭包内自行提供——参照 @deepseek-ai/dsh-client-modules 官方 bundle 格式。
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-autogate', factory: (require) => {\n" +
      "var module = { exports: {} };\n" +
      "var exports = module.exports;\n" +
      "Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });",
  },
  footer: { js: 'return module.exports; } });' },
  outfile: 'lib/client.js',
  logLevel: 'info',
})
