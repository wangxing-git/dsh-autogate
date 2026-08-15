// 客户端运行时 peer 依赖的 ambient 类型声明。
// 这些包由 DSH Web 宿主在运行时注入（package.json 的 optional peerDependencies），本地 node_modules
// 不安装；此处声明最小形状，仅用于让 client 代码通过严格类型检查，不改变运行时行为。

declare module 'react/jsx-runtime' {
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown
}

declare module 'react' {
  export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void]
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  export function createSnapshotStore(initial: unknown): any
}
