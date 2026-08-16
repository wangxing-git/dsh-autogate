/** UI 语言：跟随 DSH 设置语言（locale.preference）；未显式设置时由生产路径（index.ts）回退中文。 */
export type UiLocale = 'zh' | 'en';
/**
 * 按 UI 语言选择双语文案。生产路径由 index.ts 归一化为 'zh'/'en'（未显式设置默认中文），
 * 此处 locale 缺省（undefined）时保守回退英文——仅用于直接单测调用，不影响生产行为。
 * 两个文案参数都会先行求值（模板字符串），因此可安全嵌入动态值。
 */
export declare function reasonText(locale: UiLocale | undefined, zh: string, en: string): string;
