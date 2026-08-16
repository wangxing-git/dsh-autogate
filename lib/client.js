window.__ModuleLoader__.load({ id: 'dsh-autogate', factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_jsx_runtime = require("react/jsx-runtime");
var import_react = require("react");

// src/client-logic.ts
var import_client = require("@deepseek-ai/dsh-client-runtime/client");
var SETTINGS_NS = "autogate";
function textField(field, multiline = false) {
  return {
    field,
    multiline,
    format: (value) => typeof value === "string" ? value : "",
    parse: (text) => text === "" ? { kind: "clear" } : { kind: "set", value: text }
  };
}
function numberField(field) {
  return {
    field,
    multiline: false,
    format: (value) => typeof value === "number" ? String(value) : "",
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? { kind: "set", value: parsed } : void 0;
    }
  };
}
function boolField(field) {
  return {
    field,
    multiline: false,
    bool: true,
    format: (value) => value === true ? "true" : "false",
    parse: (text) => {
      if (text === "true") return { kind: "set", value: true };
      if (text === "false") return { kind: "set", value: false };
      return void 0;
    }
  };
}
var CardForm = class {
  scope;
  specs;
  staged = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  saving = false;
  failed = false;
  constructor(scope, specs) {
    this.scope = scope;
    this.specs = new Map(specs.map((s) => [s.field, s]));
    scope.subscribe(() => this.publish());
  }
  bind(project) {
    const store = (0, import_client.createSnapshotStore)(project());
    this.listeners.add(() => store.set(project()));
    return store;
  }
  shell() {
    const snapshot = this.scope.getSnapshot();
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      dirty: this.staged.size > 0,
      invalid: false,
      saving: this.saving,
      failed: this.failed
    };
  }
  field(field) {
    const spec = this.specs.get(field);
    const staged = this.staged.get(field);
    const snapshot = this.scope.getSnapshot();
    const value = snapshot.value?.[field];
    const user = snapshot.user;
    const stored = user !== void 0 && Object.hasOwn(user, field);
    if (staged === void 0) {
      return { text: spec.format(value), overridden: stored, invalid: false };
    }
    if (staged.clear) return { text: staged.text, overridden: false, invalid: false };
    const parsed = spec.parse(staged.text);
    return { text: staged.text, overridden: true, invalid: parsed === void 0 };
  }
  actions() {
    return {
      edit: (field, text) => {
        this.staged.set(field, { text, clear: false });
        this.publish();
      },
      resetField: (field) => {
        this.staged.set(field, { text: "", clear: true });
        this.publish();
      },
      save: () => this.save(),
      discard: () => {
        this.staged.clear();
        this.failed = false;
        this.publish();
      }
    };
  }
  async save() {
    if (this.staged.size === 0 || this.saving) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    const set = {};
    const unset = [];
    let landed = true;
    for (const [field, staged] of this.staged) {
      const spec = this.specs.get(field);
      if (staged.clear) {
        unset.push(field);
        continue;
      }
      const parsed = spec.parse(staged.text);
      if (parsed === void 0 || parsed.kind !== "set") {
        landed = false;
        continue;
      }
      set[field] = parsed.value;
    }
    if (landed && (Object.keys(set).length > 0 || unset.length > 0)) {
      landed = await this.scope.write(set, unset);
    }
    if (landed) this.staged.clear();
    this.saving = false;
    this.failed = !landed;
    this.publish();
  }
  publish() {
    for (const l of this.listeners) l();
  }
};
var RpcSettingsSource = class {
  store;
  rpc;
  constructor(rpc) {
    this.rpc = rpc;
    this.store = (0, import_client.createSnapshotStore)({ status: "loading", writable: false, value: {}, user: {} });
    void this.refresh();
  }
  async refresh() {
    if (this.rpc === void 0 || typeof this.rpc.call !== "function") {
      this.store.set({ status: "unavailable", writable: false, value: {}, user: {} });
      return;
    }
    try {
      const result = await this.rpc.call("/autogate", "settings.get", {});
      if (result !== null && typeof result === "object" && result.ok === true && result.value !== null && typeof result.value === "object") {
        this.store.set({
          status: "ready",
          writable: result.value.writable === true,
          value: result.value.value ?? {},
          user: result.value.user ?? {}
        });
      } else {
        this.store.set({ status: "unavailable", writable: false, value: {}, user: {} });
      }
    } catch {
    }
  }
  getSnapshot() {
    return this.store.getSnapshot();
  }
  subscribe(listener) {
    return this.store.subscribe(listener);
  }
  async write(set, unset) {
    if (this.rpc === void 0 || typeof this.rpc.call !== "function") return false;
    try {
      const result = await this.rpc.call("/autogate", "settings.write", { set, unset });
      if (result !== null && typeof result === "object" && result.ok === true) {
        await this.refresh();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
};
var TrailController = class {
  store;
  timer;
  rpc;
  settings;
  records = [];
  enabled = true;
  unsubscribe;
  constructor(rpc, settings) {
    this.rpc = rpc;
    this.settings = settings;
    this.store = (0, import_client.createSnapshotStore)({ enabled: true, records: [] });
    this.unsubscribe = settings.subscribe(() => this.sync());
    this.sync();
  }
  /** 依据 showTrail 配置启停轮询：关闭时清空记录并停止拉取，浮窗不再渲染。 */
  sync() {
    this.enabled = this.settings.getSnapshot().value?.showTrail !== false;
    if (this.enabled && this.timer === void 0) {
      this.timer = setInterval(() => {
        void this.refresh();
      }, 2e3);
      void this.refresh();
    } else if (!this.enabled && this.timer !== void 0) {
      clearInterval(this.timer);
      this.timer = void 0;
      this.records = [];
    }
    this.publish();
  }
  async refresh() {
    try {
      const result = await this.rpc.call("/autogate", "trail", {});
      if (result !== null && typeof result === "object" && result.ok === true && Array.isArray(result.value)) {
        this.records = result.value;
        this.publish();
      }
    } catch {
    }
  }
  publish() {
    this.store.set({ enabled: this.enabled, records: this.records });
  }
  inject() {
    return { hooks: { trail: this.store } };
  }
  dispose = () => {
    if (this.timer !== void 0) clearInterval(this.timer);
    this.unsubscribe?.();
  };
};
function formatTime(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  if (ms < 1e3) return Math.round(ms) + "ms";
  return (ms / 1e3).toFixed(1) + "s";
}
var zh = {
  title: "\u81EA\u52A8\u5BA1\u6279\uFF08autogate\uFF09",
  description: "\u786E\u5B9A\u6027\u89C4\u5219 + LLM \u5BA1\u67E5\u7684\u81EA\u52A8\u5BA1\u6279\u7B56\u7565\uFF0C\u4FDD\u7559 workspace-write \u6C99\u7BB1",
  unsaved: "\u672A\u4FDD\u5B58",
  readOnly: "\u5F53\u524D\u914D\u7F6E\u53EA\u8BFB",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  discard: "\u653E\u5F03",
  saveFailed: "\u4FDD\u5B58\u5931\u8D25",
  overridden: "\u5DF2\u8986\u76D6",
  reset: "\u91CD\u7F6E",
  invalid: "\u65E0\u6548\u8F93\u5165",
  preflight: "\u6C99\u76D2\u524D\u62E6\u622A\u5224\u65AD",
  preflightHint: "\u5F00\u542F\u5219\u5728\u505A\u6C99\u76D2\u524D\u6267\u884C\u786E\u5B9A\u6027\u89C4\u5219\u4E0E LLM \u5206\u7C7B\uFF1B\u5173\u95ED\uFF08\u9ED8\u8BA4\uFF09\u5219\u5B8C\u5168\u4F9D\u8D56\u6C99\u76D2\u7B56\u7565\uFF0C\u786C deny \u4E0E\u63D0\u6743\u5BA1\u6279\u4E0D\u53D7\u5F71\u54CD",
  showTrail: "\u5BA1\u6279\u8F68\u8FF9\u6D6E\u7A97",
  showTrailHint: "\u53F3\u4E0B\u89D2\u60AC\u6D6E\u5BA1\u6279\u8F68\u8FF9\u9762\u677F\uFF08\u9ED8\u8BA4\u663E\u793A\uFF09\uFF1B\u5173\u95ED\u5219\u4E0D\u663E\u793A\u6D6E\u7A97\u4E14\u505C\u6B62\u8F6E\u8BE2\u8F68\u8FF9\u63A5\u53E3",
  presetName: "\u534A\u81EA\u52A8\u6743\u9650\u9884\u8BBE\u952E",
  presetNameHint: "\u534A\u81EA\u52A8\u6A21\u5F0F\u9884\u8BBE\u952E\uFF08\u9ED8\u8BA4 auto-ask\uFF09\uFF1ALLM \u62D2\u7EDD\u540E\u8F6C\u4EBA\u5DE5\u515C\u5E95\u5F39\u7A97",
  fullAutoPresetName: "\u5168\u81EA\u52A8\u6743\u9650\u9884\u8BBE\u952E",
  fullAutoPresetNameHint: "\u5168\u81EA\u52A8\u6A21\u5F0F\u9884\u8BBE\u952E\uFF08\u9ED8\u8BA4 auto\uFF09\uFF1ALLM \u88C1\u51B3\u4E3A\u6700\u7EC8\u51B3\u5B9A\uFF0C\u4E0D\u518D\u4EBA\u5DE5\u5F39\u7A97\u515C\u5E95",
  classifierProvider: "\u5206\u7C7B provider",
  classifierProviderHint: "\u56FA\u5B9A\u5206\u7C7B provider\uFF0C\u987B\u4E0E\u5206\u7C7B\u6A21\u578B\u6210\u5BF9\u914D\u7F6E",
  classifierModel: "\u5206\u7C7B\u6A21\u578B",
  classifierModelHint: "\u56FA\u5B9A\u5206\u7C7B\u6A21\u578B\uFF0C\u987B\u4E0E\u5206\u7C7B provider \u6210\u5BF9\u914D\u7F6E",
  classifierEndpoint: "\u5206\u7C7B\u7AEF\u70B9",
  classifierEndpointHint: "\u72EC\u7ACB OpenAI \u517C\u5BB9\u5206\u7C7B\u7AEF\u70B9\uFF08HTTPS\uFF1Bloopback \u53EF\u7528 http\uFF09\uFF0C\u7559\u7A7A\u590D\u7528\u4F1A\u8BDD\u6A21\u578B",
  classifierPrompt: "\u5BA1\u67E5\u63D0\u793A\u8BCD",
  classifierPromptHint: "LLM \u5BA1\u67E5\uFF08\u5206\u7C7B\uFF09\u7CFB\u7EDF\u63D0\u793A\u8BCD\uFF0C\u7559\u7A7A\u4F7F\u7528\u5185\u7F6E\u9ED8\u8BA4",
  classifierTimeoutMs: "\u5206\u7C7B\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
  classifierTimeoutMsHint: "100\u201360000\uFF0C\u8D85\u65F6 fail-closed",
  classifierMaxOutputTokens: "\u8F93\u51FA token \u4E0A\u9650",
  classifierMaxOutputTokensHint: "64\u20134096",
  classifierRetry: "\u89E3\u6790\u5931\u8D25\u91CD\u8BD5",
  classifierRetryHint: "\u5206\u7C7B\u5668\u8F93\u51FA\u89E3\u6790\u5931\u8D25\u65F6\u9759\u9ED8\u91CD\u8BD5\u4E00\u6B21\uFF08\u9ED8\u8BA4\u5F00\u542F\uFF09",
  // 审批轨迹面板
  trailTitle: "\u5BA1\u6279\u8F68\u8FF9",
  trailCollapse: "\u6536\u8D77",
  locate: "\u5B9A\u4F4D",
  summaryLabel: "\u64CD\u4F5C",
  reasonLabel: "\u7406\u7531",
  timeLabel: "\u65F6\u95F4",
  durationLabel: "\u8017\u65F6",
  decisionAllow: "\u653E\u884C",
  decisionDeny: "\u62D2\u7EDD",
  decisionAsk: "\u8F6C\u4EBA\u5DE5"
};
var en = {
  title: "Auto Approval (autogate)",
  description: "Deterministic rules + LLM review, keeping the workspace-write sandbox",
  unsaved: "Unsaved",
  readOnly: "This configuration is read-only",
  save: "Save",
  saving: "Saving\u2026",
  discard: "Discard",
  saveFailed: "Save failed",
  overridden: "Overridden",
  reset: "Reset",
  invalid: "Invalid",
  preflight: "Pre-sandbox interception",
  preflightHint: "When enabled, run deterministic rules and LLM classification before the sandbox; disabled (default) relies entirely on the sandbox \u2014 hard deny and escalation approval are unaffected",
  showTrail: "Approval trail overlay",
  showTrailHint: "Floating approval trail panel in the bottom-right (default on); off hides it and stops polling the trail RPC",
  presetName: "Semi-auto permission preset",
  presetNameHint: "Semi-auto preset key (default auto-ask): LLM denials fall back to a human prompt",
  fullAutoPresetName: "Full-auto permission preset",
  fullAutoPresetNameHint: "Full-auto preset key (default auto): the LLM decision is final, no human fallback prompt",
  classifierProvider: "Classifier provider",
  classifierProviderHint: "Fixed classifier provider; must be paired with the model",
  classifierModel: "Classifier model",
  classifierModelHint: "Fixed classifier model; must be paired with the provider",
  classifierEndpoint: "Classifier endpoint",
  classifierEndpointHint: "Standalone OpenAI-compatible endpoint (HTTPS; loopback HTTP ok); empty reuses the session model",
  classifierPrompt: "Review prompt",
  classifierPromptHint: "LLM review (classification) system prompt; empty uses the built-in default",
  classifierTimeoutMs: "Classifier timeout (ms)",
  classifierTimeoutMsHint: "100\u201360000, fail-closed on timeout",
  classifierMaxOutputTokens: "Max output tokens",
  classifierMaxOutputTokensHint: "64\u20134096",
  classifierRetry: "Retry on parse failure",
  classifierRetryHint: "Retry once when classifier output fails to parse (default on)",
  // 审批轨迹面板
  trailTitle: "Approval trail",
  trailCollapse: "Collapse",
  locate: "Locate",
  summaryLabel: "Action",
  reasonLabel: "Reason",
  timeLabel: "Time",
  durationLabel: "Duration",
  decisionAllow: "Allow",
  decisionDeny: "Deny",
  decisionAsk: "Ask"
};

// src/client.tsx
var CSS = `.sa_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none}
.sa_card:hover{border-color:var(--dsw-alias-label-dimmed)}
.sa_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.sa_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.sa_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.sa_desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.sa_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.sa_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.sa_chevronOpen{transform:rotate(180deg)}
.sa_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.sa_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}
.sa_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}
.sa_field+.sa_field{border-top:1px solid var(--dsw-alias-border-l2)}
.sa_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}
.sa_head{display:flex;align-items:center;gap:8px}
.sa_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.sa_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}
.sa_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 12px;font-size:13px;line-height:1.5}
.sa_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
.sa_textarea{min-height:120px;resize:vertical;font-family:inherit}
.sa_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.sa_bool{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;margin:0;flex:none}
.sa_invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}
.sa_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}
.sa_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}
.sa_btn{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.sa_btnDiscard{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.sa_btnSave{border:1px solid #0000;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-primary-fill)}
.sa_btnSave:hover{background:var(--dsw-alias-button-primary-hover)}
.sa_trail{position:fixed;right:16px;bottom:16px;z-index:1000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:380px;pointer-events:auto}
.sa_trailToggle{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:999px;padding:6px 14px;font-size:12px;line-height:1.5;box-shadow:0 2px 8px #0000002e}
.sa_trailList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:360px;overflow:auto}
.sa_trailItem{display:flex;flex-direction:column;gap:2px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;padding:6px 10px;font-size:12px;line-height:1.5}
.sa_trailItem--deny{border-left:3px solid var(--dsw-alias-label-error)}
.sa_trailItem--allow{border-left:3px solid #2f9e44}
.sa_trailItem--ask{border-left:3px solid #f08c00}
.sa_trailMeta{color:var(--dsw-alias-label-secondary);font-weight:600}
.sa_trailSummary{color:var(--dsw-alias-label-primary);word-break:break-all}
.sa_trailReason{color:var(--dsw-alias-label-tertiary);word-break:break-all}
.sa_trailItemHead{display:flex;align-items:center;gap:6px}
.sa_trailItemToggle{appearance:none;font:inherit;cursor:pointer;background:0 0;border:0;padding:0;flex:1;min-width:0;display:flex;align-items:center;gap:6px;color:inherit;text-align:left}
.sa_trailChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.sa_trailChevronOpen{transform:rotate(180deg)}
.sa_trailLocate{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:1px 8px;font-size:11px;line-height:1.5;flex:none}
.sa_trailLocate:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.sa_trailItemBody{display:flex;flex-direction:column;gap:4px;margin-top:4px;padding-top:4px;border-top:1px dashed var(--dsw-alias-border-l2)}
.sa_trailRow{display:flex;gap:8px;min-width:0}
.sa_trailRowLabel{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;line-height:1.5}
.sa_trailDetail{color:var(--dsw-alias-label-secondary);word-break:break-all;font-size:12px;line-height:1.5}`;
function injectCss() {
  const tagId = "dsh-autogate/client.css";
  if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-autogate";
    tag.dataset.pluginCss = tagId;
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }
}
var SafeAutoCardController = class {
  form;
  store;
  constructor(settingsSource) {
    this.form = new CardForm(settingsSource, [
      textField("presetName"),
      textField("fullAutoPresetName"),
      textField("classifierProvider"),
      textField("classifierModel"),
      textField("classifierEndpoint"),
      textField("classifierPrompt", true),
      numberField("classifierTimeoutMs"),
      numberField("classifierMaxOutputTokens"),
      boolField("classifierRetry"),
      boolField("preflight"),
      boolField("showTrail")
    ]);
    this.store = this.form.bind(() => this.projection());
  }
  projection() {
    return {
      ...this.form.shell(),
      presetName: this.form.field("presetName"),
      fullAutoPresetName: this.form.field("fullAutoPresetName"),
      classifierProvider: this.form.field("classifierProvider"),
      classifierModel: this.form.field("classifierModel"),
      classifierEndpoint: this.form.field("classifierEndpoint"),
      classifierPrompt: this.form.field("classifierPrompt"),
      classifierTimeoutMs: this.form.field("classifierTimeoutMs"),
      classifierMaxOutputTokens: this.form.field("classifierMaxOutputTokens"),
      classifierRetry: this.form.field("classifierRetry"),
      preflight: this.form.field("preflight"),
      showTrail: this.form.field("showTrail")
    };
  }
  inject() {
    return {
      hooks: { safeAutoCard: this.store },
      ...this.form.actions()
    };
  }
};
function ValueField(props) {
  const control = props.bool ? (0, import_jsx_runtime.jsx)("input", {
    id: props.id,
    className: "sa_bool",
    type: "checkbox",
    checked: props.text === "true",
    disabled: props.disabled,
    onChange: (event) => props.onEdit(event.target.checked ? "true" : "false")
  }) : props.multiline ? (0, import_jsx_runtime.jsx)("textarea", {
    id: props.id,
    className: "sa_input sa_textarea",
    value: props.text,
    placeholder: props.placeholder ?? "",
    disabled: props.disabled,
    onChange: (event) => props.onEdit(event.target.value)
  }) : (0, import_jsx_runtime.jsx)("input", {
    id: props.id,
    className: "sa_input",
    type: "text",
    value: props.text,
    placeholder: props.placeholder ?? "",
    disabled: props.disabled,
    onChange: (event) => props.onEdit(event.target.value)
  });
  return (0, import_jsx_runtime.jsxs)("div", {
    className: "sa_field",
    children: [
      (0, import_jsx_runtime.jsxs)("div", {
        className: "sa_head",
        children: [
          (0, import_jsx_runtime.jsx)("label", { className: "sa_label", htmlFor: props.id, children: props.label }),
          props.overridden ? (0, import_jsx_runtime.jsxs)("span", {
            children: [
              (0, import_jsx_runtime.jsx)("span", { className: "sa_badge", children: props.overriddenLabel }),
              (0, import_jsx_runtime.jsx)("button", { type: "button", className: "sa_reset", disabled: props.disabled, onClick: props.onReset, children: props.resetLabel })
            ]
          }) : null
        ]
      }),
      control,
      (0, import_jsx_runtime.jsx)("p", { className: props.invalid ? "sa_invalid" : "sa_hint", children: props.invalid ? props.invalidLabel : props.hint })
    ]
  });
}
function SafeAutoCard(props) {
  const { t } = props;
  const state = props.useSafeAutoCard((snapshot) => snapshot);
  const [open, setOpen] = (0, import_react.useState)(false);
  injectCss();
  if (!state.available) return null;
  const disabled = !state.writable;
  const blocked = !state.dirty || state.invalid || state.saving;
  const fields = [
    { key: "preflight", label: t("preflight"), hint: t("preflightHint"), bool: true },
    { key: "presetName", label: t("presetName"), hint: t("presetNameHint") },
    { key: "fullAutoPresetName", label: t("fullAutoPresetName"), hint: t("fullAutoPresetNameHint") },
    { key: "classifierProvider", label: t("classifierProvider"), hint: t("classifierProviderHint") },
    { key: "classifierModel", label: t("classifierModel"), hint: t("classifierModelHint") },
    { key: "classifierEndpoint", label: t("classifierEndpoint"), hint: t("classifierEndpointHint") },
    { key: "classifierPrompt", label: t("classifierPrompt"), hint: t("classifierPromptHint"), multiline: true },
    { key: "classifierTimeoutMs", label: t("classifierTimeoutMs"), hint: t("classifierTimeoutMsHint") },
    { key: "classifierMaxOutputTokens", label: t("classifierMaxOutputTokens"), hint: t("classifierMaxOutputTokensHint") },
    { key: "classifierRetry", label: t("classifierRetry"), hint: t("classifierRetryHint"), bool: true },
    { key: "showTrail", label: t("showTrail"), hint: t("showTrailHint"), bool: true }
  ];
  return (0, import_jsx_runtime.jsxs)("li", {
    className: "sa_card",
    children: [
      (0, import_jsx_runtime.jsxs)("button", {
        type: "button",
        className: "sa_header",
        "aria-expanded": open,
        onClick: () => setOpen(!open),
        children: [
          (0, import_jsx_runtime.jsxs)("span", {
            className: "sa_headText",
            children: [
              (0, import_jsx_runtime.jsx)("span", { className: "sa_name", children: t("title") }),
              (0, import_jsx_runtime.jsx)("span", { className: "sa_desc", children: t("description") })
            ]
          }),
          state.dirty ? (0, import_jsx_runtime.jsx)("span", { className: "sa_pending", children: t("unsaved") }) : null,
          (0, import_jsx_runtime.jsx)("span", { className: open ? "sa_chevron sa_chevronOpen" : "sa_chevron", children: "\u25BE" })
        ]
      }),
      open ? (0, import_jsx_runtime.jsxs)("div", {
        className: "sa_body",
        children: [
          !state.writable ? (0, import_jsx_runtime.jsx)("p", { className: "sa_readOnly", children: t("readOnly") }) : null,
          fields.map((f) => (0, import_jsx_runtime.jsx)(ValueField, {
            key: f.key,
            id: "autogate-" + f.key,
            label: f.label,
            hint: f.hint,
            multiline: f.multiline === true,
            bool: f.bool === true,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalidLabel: t("invalid"),
            disabled,
            ...state[f.key],
            onEdit: (text) => props.edit(f.key, text),
            onReset: () => props.resetField(f.key)
          })),
          (0, import_jsx_runtime.jsxs)("div", {
            className: "sa_footer",
            children: [
              state.failed ? (0, import_jsx_runtime.jsx)("p", { className: "sa_failed", children: t("saveFailed") }) : null,
              (0, import_jsx_runtime.jsx)("button", { type: "button", className: "sa_btn sa_btnDiscard", disabled: !state.dirty || state.saving, onClick: props.discard, children: t("discard") }),
              (0, import_jsx_runtime.jsx)("button", { type: "button", className: "sa_btn sa_btnSave", disabled: blocked, onClick: props.save, children: t(state.saving ? "saving" : "save") })
            ]
          })
        ]
      }) : null
    ]
  });
}
function TrailItem(props) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const { record, onLocate, t } = props;
  const decisionText = { allow: t("decisionAllow"), deny: t("decisionDeny"), ask: t("decisionAsk") }[record.decision] ?? record.decision;
  return (0, import_jsx_runtime.jsxs)("li", {
    className: "sa_trailItem sa_trailItem--" + record.decision,
    children: [
      (0, import_jsx_runtime.jsxs)("div", {
        className: "sa_trailItemHead",
        children: [
          (0, import_jsx_runtime.jsxs)("button", {
            type: "button",
            className: "sa_trailItemToggle",
            "aria-expanded": open,
            onClick: () => setOpen(!open),
            children: [
              (0, import_jsx_runtime.jsx)("span", { className: "sa_trailMeta", children: record.layer + " \xB7 " + decisionText + " \xB7 " + record.toolName }),
              (0, import_jsx_runtime.jsx)("span", { className: open ? "sa_trailChevron sa_trailChevronOpen" : "sa_trailChevron", children: "\u25BE" })
            ]
          }),
          (0, import_jsx_runtime.jsx)("button", {
            type: "button",
            className: "sa_trailLocate",
            onClick: () => onLocate(record.callId),
            children: t("locate")
          })
        ]
      }),
      open ? (0, import_jsx_runtime.jsxs)("div", {
        className: "sa_trailItemBody",
        children: [
          record.summary ? (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: t("summaryLabel") }), (0, import_jsx_runtime.jsx)("span", { className: "sa_trailSummary", children: record.summary })] }) : null,
          record.reason ? (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: t("reasonLabel") }), (0, import_jsx_runtime.jsx)("span", { className: "sa_trailReason", children: record.reason })] }) : null,
          (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: "callId" }), (0, import_jsx_runtime.jsx)("span", { className: "sa_trailDetail", children: record.callId })] }),
          (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: t("timeLabel") }), (0, import_jsx_runtime.jsx)("span", { className: "sa_trailDetail", children: formatTime(record.time) })] }),
          (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: t("durationLabel") }), (0, import_jsx_runtime.jsx)("span", { className: "sa_trailDetail", children: formatDuration(record.durationMs) })] })
        ]
      }) : null
    ]
  });
}
function TrailPanel(props) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const { t, useTrail } = props;
  const snapshot = useTrail((s) => s) ?? {};
  if (snapshot.enabled === false) return null;
  const records = Array.isArray(snapshot.records) ? snapshot.records : [];
  if (records.length === 0) return null;
  const locate = (callId) => {
    const el = Array.from(document.querySelectorAll("[data-chat-call-id]")).find((node) => node.getAttribute("data-chat-call-id") === callId);
    if (el !== void 0) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  return (0, import_jsx_runtime.jsxs)("div", {
    className: "sa_trail",
    children: [
      (0, import_jsx_runtime.jsx)("button", {
        type: "button",
        className: "sa_trailToggle",
        onClick: () => setOpen(!open),
        children: (open ? t("trailCollapse") : t("trailTitle")) + " " + records.length
      }),
      open ? (0, import_jsx_runtime.jsx)("ul", {
        className: "sa_trailList",
        children: records.slice(-50).reverse().map((record) => (0, import_jsx_runtime.jsx)(TrailItem, {
          key: String(record.seq),
          record,
          onLocate: locate,
          t
        }))
      }) : null
    ]
  });
}
var inject = ["slots", "locale", "connection"];
function apply(ctx) {
  injectCss();
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), "autogate: card dictionaries");
  const t = ctx.locale.bind(SETTINGS_NS);
  const rpc = ctx.connection?.rpc;
  const settingsSource = new RpcSettingsSource(rpc);
  const controller = new SafeAutoCardController(settingsSource);
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    id: "autogate",
    order: 50,
    locale: SETTINGS_NS,
    inject: () => controller.inject()
  }, SafeAutoCard));
  const trailController = new TrailController(rpc, settingsSource);
  ctx.effect(() => trailController.dispose, "autogate: trail polling");
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "autogate-trail",
    order: 100,
    locale: SETTINGS_NS,
    inject: () => trailController.inject()
  }, TrailPanel));
}
return module.exports; } });
