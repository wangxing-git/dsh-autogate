import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      // client.tsx 为纯 JSX UI 壳（依赖 DSH Web 宿主注入的运行时），其逻辑已抽取到 client-logic.ts 单独测试。
      exclude: ['src/client.tsx'],
      reporter: ['text', 'html'],
    },
  },
})
