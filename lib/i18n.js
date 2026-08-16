/**
 * 按 UI 语言选择双语文案。生产路径由 index.ts 归一化为 'zh'/'en'（未显式设置默认中文），
 * 此处 locale 缺省（undefined）时保守回退英文——仅用于直接单测调用，不影响生产行为。
 * 两个文案参数都会先行求值（模板字符串），因此可安全嵌入动态值。
 */
export function reasonText(locale, zh, en) {
    return locale === 'zh' ? zh : en;
}
/** 不可提权指引：危险操作硬 deny，不可通过沙箱提权放行。 */
export function noEscalationHint(locale) {
    return reasonText(locale, '；此操作不可提权放行', '; this operation cannot be escalated');
}
