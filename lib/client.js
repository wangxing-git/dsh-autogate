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
var __copyProps = (to, from2, except, desc) => {
  if (from2 && typeof from2 === "object" || typeof from2 === "function") {
    for (let key of __getOwnPropNames(from2))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from2[key], enumerable: !(desc = __getOwnPropDesc(from2, key)) || desc.enumerable });
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

// node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  if (a === b) return true;
  if (!strict && isNullable(a) && isNullable(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (!a || !b) return false;
  function check(test, then) {
    return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
  }
  return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
    if (a2.byteLength !== b2.byteLength) return false;
    const viewA = new Uint8Array(a2);
    const viewB = new Uint8Array(b2);
    for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
    return true;
  }) ?? Object.keys({
    ...a,
    ...b
  }).every((key) => deepEqual(a[key], b[key], strict));
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = /* @__PURE__ */ Symbol.for("schemastery");
var kValidationError = /* @__PURE__ */ Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
var resolvers = {};
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name, keys, format) {
  formatters[name] = format;
  Object.assign(Schema, { [name](...args) {
    const schema = new Schema({ type: name });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name === "object" || name === "dict") schema.meta.default = {};
    else if (name === "array" || name === "tuple") schema.meta.default = [];
    else if (name === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/client-logic.ts
function createSnapshotStore(init) {
  let state = init;
  const listeners = /* @__PURE__ */ new Set();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(value) {
      state = value;
      notify();
    },
    update(mutator) {
      const draft = structuredClone(state);
      mutator(draft);
      state = draft;
      notify();
    }
  };
}
var SETTINGS_NS = "autogate";
var PAIRED_RESET_FIELDS = {
  classifierProvider: "classifierModel",
  classifierModel: "classifierProvider"
};
function pairedResetField(field) {
  return PAIRED_RESET_FIELDS[field];
}
function pairedReset(actions, field) {
  actions.resetField(field);
  const paired = pairedResetField(field);
  if (paired !== void 0) actions.resetField(paired);
}
function textField(field, multiline = false) {
  return {
    field,
    multiline,
    format: (value) => typeof value === "string" ? value : "",
    parse: (text) => text === "" ? { kind: "clear" } : { kind: "set", value: text }
  };
}
function selectField(field, options = []) {
  return {
    field,
    multiline: false,
    options,
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
  dynamicOptions = /* @__PURE__ */ new Map();
  saving = false;
  failed = false;
  saved = false;
  /** 最近一次保存失败的具体原因（服务端拒绝文本，如成对约束）；成功或重新编辑后清空。 */
  failedMessage = "";
  constructor(scope, specs) {
    this.scope = scope;
    this.specs = new Map(specs.map((s) => [s.field, s]));
    scope.subscribe(() => this.publish());
  }
  bind(project) {
    const store = createSnapshotStore(project());
    this.listeners.add(() => store.set(project()));
    return store;
  }
  shell() {
    const snapshot = this.scope.getSnapshot();
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      dirty: [...this.staged.entries()].some(([field, staged]) => this.fieldChanged(field, staged)),
      invalid: [...this.staged.entries()].some(([field, staged]) => this.fieldInvalid(field, staged)),
      saving: this.saving,
      failed: this.failed,
      failedMessage: this.failedMessage,
      saved: this.saved
    };
  }
  field(field) {
    const spec = this.specs.get(field);
    const staged = this.staged.get(field);
    const snapshot = this.scope.getSnapshot();
    const value = snapshot.value?.[field];
    const user = snapshot.user;
    const stored = user !== void 0 && Object.hasOwn(user, field);
    const options = this.dynamicOptions.get(field) ?? spec.options ?? [];
    if (staged === void 0) {
      return { text: spec.format(value), overridden: stored, invalid: false, dirty: false, options };
    }
    if (staged.clear) {
      const inherited = snapshot.inherited?.[field] ?? value;
      return { text: spec.format(inherited), overridden: false, invalid: false, dirty: this.fieldChanged(field, staged), options };
    }
    const parsed = spec.parse(staged.text);
    return { text: staged.text, overridden: stored, invalid: parsed === void 0, dirty: this.fieldChanged(field, staged), options };
  }
  /** 判断某字段的 staged 草稿相对已保存值是否真正变化：输入与原值相同不算变化，重置仅在 user 层有值时算变化。 */
  fieldChanged(field, staged) {
    const snapshot = this.scope.getSnapshot();
    if (staged.clear) {
      return snapshot.user !== void 0 && Object.hasOwn(snapshot.user, field);
    }
    const parsed = this.specs.get(field)?.parse(staged.text);
    if (parsed === void 0 || parsed.kind !== "set") return true;
    return !Object.is(parsed.value, snapshot.value?.[field]);
  }
  /** 判断某字段的 staged 草稿是否非法（解析失败）：非法输入应禁用保存按钮，而非等写入被拒才提示失败。 */
  fieldInvalid(field, staged) {
    if (staged.clear) return false;
    return this.specs.get(field)?.parse(staged.text) === void 0;
  }
  actions() {
    return {
      edit: (field, text) => {
        this.staged.set(field, { text, clear: false });
        this.saved = false;
        this.failedMessage = "";
        this.publish();
      },
      resetField: (field) => {
        this.staged.set(field, { text: "", clear: true });
        this.saved = false;
        this.failedMessage = "";
        this.publish();
      },
      save: () => this.save(),
      discard: () => {
        this.staged.clear();
        this.failed = false;
        this.failedMessage = "";
        this.saved = false;
        this.publish();
      }
    };
  }
  /** 动态注入某字段的下拉候选（如从服务端模型目录拉取）；重新发布快照触发重渲染。 */
  setOptions(field, options) {
    this.dynamicOptions.set(field, options);
    this.publish();
  }
  async save() {
    if (this.staged.size === 0 || this.saving) return;
    this.saving = true;
    this.failed = false;
    this.failedMessage = "";
    this.publish();
    const set2 = {};
    const unset = [];
    let landed = true;
    for (const [field, staged] of this.staged) {
      if (!this.fieldChanged(field, staged)) continue;
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
      set2[field] = parsed.value;
    }
    if (landed && (Object.keys(set2).length > 0 || unset.length > 0)) {
      const outcome = await this.scope.write(set2, unset);
      landed = outcome !== null && typeof outcome === "object" && outcome.ok === true;
      if (!landed) {
        this.failedMessage = outcome !== null && typeof outcome === "object" && typeof outcome.message === "string" ? outcome.message : "";
      }
    }
    if (landed) {
      this.staged.clear();
      this.saved = true;
    }
    this.saving = false;
    this.failed = !landed;
    this.publish();
  }
  publish() {
    for (const l of this.listeners) l();
  }
};
var ApiSettingsSource = class {
  store;
  api;
  namespace;
  constructor(api, namespace) {
    this.api = api;
    this.namespace = namespace;
    this.store = createSnapshotStore({ status: "loading", writable: false, value: {}, user: {}, inherited: {}, revision: void 0 });
    void this.refresh();
  }
  async refresh() {
    if (this.api === void 0 || typeof this.api.describe !== "function") {
      this.store.set({ status: "unavailable", writable: false, value: {}, user: {}, inherited: {}, revision: void 0 });
      return;
    }
    try {
      const response = await this.api.describe();
      if (response?.ok !== true || !Array.isArray(response.value?.namespaces)) {
        this.store.set({ status: "unavailable", writable: false, value: {}, user: {}, inherited: {}, revision: void 0 });
        return;
      }
      const writable = response.value.writable === true;
      const view = response.value.namespaces.find((candidate) => String(candidate.ns) === this.namespace);
      if (view === void 0) {
        this.store.set({ status: "unavailable", writable, value: {}, user: {}, inherited: {}, revision: void 0 });
        return;
      }
      this.store.set({
        status: "ready",
        writable,
        value: view.value ?? {},
        user: view.user ?? {},
        inherited: this.resolveInherited(view),
        revision: view.revision
      });
    } catch {
    }
  }
  /** 合成 inherited = schema 默认值 合并 composition base；schema envelope 损坏时降级为 base。 */
  resolveInherited(view) {
    const base = view.base !== null && typeof view.base === "object" ? view.base : {};
    try {
      const schema = new Schema(view.schema);
      const parsed = schema({});
      const resolved = typeof parsed === "object" && parsed !== null ? parsed : {};
      const dict = schema.dict;
      if (dict !== void 0) {
        for (const field of Object.keys(dict)) {
          if (!Object.hasOwn(resolved, field)) resolved[field] = "";
        }
      }
      return { ...resolved, ...base };
    } catch {
      return base;
    }
  }
  getSnapshot() {
    return this.store.getSnapshot();
  }
  subscribe(listener) {
    return this.store.subscribe(listener);
  }
  async write(set2, unset) {
    if (this.api === void 0 || typeof this.api.mutate !== "function") {
      return { ok: false, message: "\u8BBE\u7F6E\u670D\u52A1\u4E0D\u53EF\u7528" };
    }
    const ops = [
      ...Object.entries(set2).map(([field, value]) => ({ op: "set", path: [field], value })),
      ...unset.map((field) => ({ op: "unset", path: [field] }))
    ];
    if (ops.length === 0) return { ok: true, message: "" };
    try {
      const revision = this.getSnapshot().revision;
      const response = await this.api.mutate(this.namespace, ops, revision);
      if (response?.ok === true) {
        await this.refresh();
        return { ok: true, message: "" };
      }
      const error = response?.error;
      await this.refresh();
      return { ok: false, message: error?.message ?? "\u4FDD\u5B58\u88AB\u62D2\u7EDD" };
    } catch {
      return { ok: false, message: "\u4FDD\u5B58\u5931\u8D25\uFF08\u7F51\u7EDC\u6216\u670D\u52A1\u5F02\u5E38\uFF09" };
    }
  }
};
var TrailController = class {
  store;
  timer;
  rpc;
  settings;
  sessions;
  records = [];
  enabled = true;
  currentSessionId;
  /** 是否「查看全部」：临时开关，默认 false（按当前会话隔离），刷新页面后复位。 */
  showAll = false;
  unsubscribeSettings;
  unsubscribeSessions;
  constructor(rpc, settings, sessions) {
    this.rpc = rpc;
    this.settings = settings;
    this.sessions = sessions;
    this.store = createSnapshotStore({ enabled: true, records: [], showAll: false });
    this.unsubscribeSettings = settings.subscribe(() => this.sync());
    if (sessions !== void 0 && typeof sessions.list?.subscribe === "function") {
      this.unsubscribeSessions = sessions.list.subscribe(() => this.sync());
    }
    this.sync();
  }
  /** 读取当前选中会话 id（无会话选中时返回 undefined）。 */
  resolveSessionId() {
    const list = this.sessions?.list;
    if (list === void 0 || typeof list.getSnapshot !== "function") return void 0;
    const current = list.getSnapshot().current;
    return current === void 0 || current === null ? void 0 : String(current);
  }
  /** 依据 showTrail 配置启停轮询；当前会话切换时清空旧记录并立即刷新，保证浮窗只显示当前会话的轨迹。 */
  sync() {
    this.enabled = this.settings.getSnapshot().value?.showTrail !== false;
    const nextSessionId = this.resolveSessionId();
    const sessionChanged = nextSessionId !== this.currentSessionId;
    this.currentSessionId = nextSessionId;
    if (this.enabled && this.timer === void 0) {
      this.timer = setInterval(() => {
        void this.refresh();
      }, 2e3);
      void this.refresh();
    } else if (!this.enabled && this.timer !== void 0) {
      clearInterval(this.timer);
      this.timer = void 0;
      this.records = [];
    } else if (this.enabled && sessionChanged && !this.showAll) {
      this.records = [];
      void this.refresh();
    }
    this.publish();
  }
  async refresh() {
    const payload = this.showAll || this.currentSessionId === void 0 ? {} : { sessionId: this.currentSessionId };
    try {
      const result = await this.rpc.call("/autogate", "trail", payload);
      if (result !== null && typeof result === "object" && result.ok === true && Array.isArray(result.value)) {
        this.records = result.value;
        this.publish();
      }
    } catch {
    }
  }
  publish() {
    this.store.set({ enabled: this.enabled, records: this.records, showAll: this.showAll });
  }
  inject() {
    return { hooks: { trail: this.store }, toggleShowAll: this.toggleShowAll, setShowAll: this.setShowAll };
  }
  /** 切换「当前会话 / 查看全部」显示范围（临时状态，刷新页面后回到默认「当前会话」隔离）。 */
  toggleShowAll = () => {
    this.setShowAll(!this.showAll);
  };
  /** 显式设置显示范围；状态未变化时不重复刷新（tab 点击已选中项无副作用）。 */
  setShowAll = (value) => {
    if (this.showAll === value) return;
    this.showAll = value;
    this.publish();
    if (this.enabled) void this.refresh();
  };
  dispose = () => {
    if (this.timer !== void 0) clearInterval(this.timer);
    this.unsubscribeSettings?.();
    this.unsubscribeSessions?.();
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
  saved: "\u5DF2\u4FDD\u5B58",
  dirtyLabel: "\u672A\u4FDD\u5B58\u7684\u4FEE\u6539",
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
  classifierProviderHint: "\u56FA\u5B9A\u5206\u7C7B provider\uFF0C\u987B\u4E0E\u5206\u7C7B\u6A21\u578B\u6210\u5BF9\u914D\u7F6E\uFF1B\u91CD\u7F6E\u5176\u4E2D\u4E00\u9879\u4F1A\u8054\u52A8\u6E05\u7A7A\u53E6\u4E00\u9879",
  classifierModel: "\u5206\u7C7B\u6A21\u578B",
  classifierModelHint: "\u56FA\u5B9A\u5206\u7C7B\u6A21\u578B\uFF0C\u987B\u4E0E\u5206\u7C7B provider \u6210\u5BF9\u914D\u7F6E\uFF1B\u91CD\u7F6E\u5176\u4E2D\u4E00\u9879\u4F1A\u8054\u52A8\u6E05\u7A7A\u53E6\u4E00\u9879",
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
  classifierHttpDisableReasoning: "HTTP \u7AEF\u70B9\u5173\u95ED\u601D\u8003",
  classifierHttpDisableReasoningHint: "HTTP \u5206\u7C7B\u8BF7\u6C42\u643A\u5E26 reasoning_effort=none \u663E\u5F0F\u5173\u95ED\u601D\u8003\u6A21\u5F0F\uFF08OpenAI \u5B98\u65B9\u7AEF\u70B9\u652F\u6301\uFF09\uFF1B\u7AEF\u70B9\u4E0D\u652F\u6301\u8BE5\u53C2\u6570\u62A5 400 \u65F6\u5173\u95ED\u6B64\u5F00\u5173\uFF08\u9ED8\u8BA4\u5F00\u542F\uFF09",
  proposalContextMaxMessageLen: "\u6307\u4EE3\u6D88\u606F\u957F\u5EA6\u9608\u503C",
  proposalContextMaxMessageLenHint: "\u957F\u5EA6\u4E0D\u8D85\u8FC7\u8BE5\u503C\uFF08\u5B57\u7B26\uFF09\u7684\u7528\u6237\u6D88\u606F\u624D\u643A\u5E26 AI \u63D0\u8BAE\u4E0A\u4E0B\u6587\u7528\u4E8E\u6D88\u89E3\u6307\u4EE3\uFF1B\u9ED8\u8BA4 10",
  proposalContextMaxChars: "\u5355\u6761\u4E0A\u4E0B\u6587\u4E0A\u9650",
  proposalContextMaxCharsHint: "\u5355\u6761 AI \u63D0\u8BAE\u4E0A\u4E0B\u6587\u7684\u6700\u5927\u5B57\u7B26\u6570\uFF0864\u20134000\uFF09\uFF1B\u9ED8\u8BA4 400",
  proposalContextMaxTotalChars: "\u4E0A\u4E0B\u6587\u603B\u9884\u7B97",
  proposalContextMaxTotalCharsHint: "\u591A\u6761\u6D88\u606F\u7684 AI \u63D0\u8BAE\u4E0A\u4E0B\u6587\u5408\u8BA1\u5B57\u7B26\u4E0A\u9650\uFF0864\u20138000\uFF09\uFF1B\u9ED8\u8BA4 2000",
  // 审批轨迹面板
  trailTitle: "\u5BA1\u6279\u8F68\u8FF9",
  trailCollapse: "\u6536\u8D77",
  trailScopeSession: "\u5F53\u524D\u4F1A\u8BDD",
  trailScopeAll: "\u67E5\u770B\u5168\u90E8",
  locate: "\u5B9A\u4F4D",
  summaryLabel: "\u64CD\u4F5C",
  reasonLabel: "\u7406\u7531",
  timeLabel: "\u65F6\u95F4",
  durationLabel: "\u8017\u65F6",
  classifierInputLabel: "LLM \u8F93\u5165",
  tokenUsageLabel: "Token",
  tokenCachedInput: "\u7F13\u5B58\u8F93\u5165",
  tokenUncachedInput: "\u672A\u7F13\u5B58\u8F93\u5165",
  tokenOutput: "\u8F93\u51FA",
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
  saved: "Saved",
  dirtyLabel: "Unsaved changes",
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
  classifierProviderHint: "Fixed classifier provider; must be paired with the model \u2014 resetting either one clears both",
  classifierModel: "Classifier model",
  classifierModelHint: "Fixed classifier model; must be paired with the provider \u2014 resetting either one clears both",
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
  classifierHttpDisableReasoning: "Disable reasoning (HTTP)",
  classifierHttpDisableReasoningHint: "Send reasoning_effort=none to explicitly disable thinking on the HTTP classifier endpoint (supported by OpenAI); turn off when the endpoint rejects the parameter with 400 (default on)",
  proposalContextMaxMessageLen: "Reference message max length",
  proposalContextMaxMessageLenHint: "Only user messages up to this length (chars) carry the AI proposal context for reference resolution; default 10",
  proposalContextMaxChars: "Per-context max chars",
  proposalContextMaxCharsHint: "Max chars for a single AI proposal context (64\u20134000); default 400",
  proposalContextMaxTotalChars: "Context total budget",
  proposalContextMaxTotalCharsHint: "Total chars across all AI proposal contexts (64\u20138000); default 2000",
  // 审批轨迹面板
  trailTitle: "Approval trail",
  trailCollapse: "Collapse",
  trailScopeSession: "Current session",
  trailScopeAll: "All sessions",
  locate: "Locate",
  summaryLabel: "Action",
  reasonLabel: "Reason",
  timeLabel: "Time",
  durationLabel: "Duration",
  classifierInputLabel: "LLM input",
  tokenUsageLabel: "Tokens",
  tokenCachedInput: "cached input",
  tokenUncachedInput: "uncached input",
  tokenOutput: "output",
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
.sa_dirtyDot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);margin-right:6px;flex:none}
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
.sa_saved{min-width:0;color:var(--dsw-alias-state-success-primary);flex:1;margin:0;font-size:12px;line-height:1.5}
.sa_btn{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.sa_btnDiscard{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.sa_btnSave{border:1px solid #0000;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-primary-fill)}
.sa_btnSave:hover{background:var(--dsw-alias-button-primary-hover)}
.sa_trail{position:fixed;right:16px;bottom:16px;z-index:1000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:380px;pointer-events:auto}
.sa_trailToggle{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:999px;padding:6px 14px;font-size:12px;line-height:1.5;box-shadow:0 2px 8px #0000002e;align-items:center;gap:6px;display:inline-flex}
.sa_trailToggle:hover{border-color:var(--dsw-alias-label-dimmed)}
.sa_trailToggleDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}
.sa_trailToggleDot--allow{background:var(--dsw-alias-state-success-primary)}
.sa_trailToggleDot--deny{background:var(--dsw-alias-state-error-primary)}
.sa_trailToggleDot--ask{background:var(--dsw-alias-state-warn-primary)}
.sa_trailToggleStats{display:inline-flex;align-items:center;gap:6px}
.sa_trailToggleStat{white-space:nowrap;font-size:11px;font-weight:500;line-height:1.5}
.sa_trailToggleStat--allow{color:var(--dsw-alias-state-success-primary)}
.sa_trailToggleStat--deny{color:var(--dsw-alias-state-error-primary)}
.sa_trailToggleStat--ask{color:var(--dsw-alias-state-warn-primary)}
.sa_trailPanel{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;box-shadow:0 4px 16px #00000026;overflow:hidden}
.sa_trailTabs{display:flex;border-bottom:1px solid var(--dsw-alias-border-l2)}
.sa_trailTab{appearance:none;font:inherit;cursor:pointer;border:0;background:0 0;color:var(--dsw-alias-label-secondary);padding:6px 12px;font-size:12px;line-height:1.5;flex:1;text-align:center}
.sa_trailTab:hover{color:var(--dsw-alias-label-primary)}
.sa_trailTab--active{color:var(--dsw-alias-brand-primary);font-weight:600;box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}
.sa_trailList{list-style:none;margin:0;padding:8px;display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto}
.sa_trailItem{display:flex;flex-direction:column;gap:2px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:8px 10px;font-size:12px;line-height:1.5;transition:background .12s}
.sa_trailItem:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sa_trailItem--deny{border-left:3px solid var(--dsw-alias-state-error-primary)}
.sa_trailItem--allow{border-left:3px solid var(--dsw-alias-state-success-primary)}
.sa_trailItem--ask{border-left:3px solid var(--dsw-alias-state-warn-primary)}
.sa_trailBadge{white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;line-height:17px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);flex:none}
.sa_trailBadge--allow{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent)}
.sa_trailBadge--deny{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent)}
.sa_trailBadge--ask{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent)}
.sa_trailLayer{white-space:nowrap;border-radius:999px;padding:1px 6px;font-size:10px;font-weight:600;line-height:15px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);flex:none}
.sa_trailTool{color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,ui-monospace,SF Mono,Menlo,Consolas,monospace);font-size:12px;line-height:1.5;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa_trailTime{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5;flex:none;white-space:nowrap}
.sa_trailPreview{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sa_trailItemHead{display:flex;align-items:center;gap:6px}
.sa_trailItemToggle{appearance:none;font:inherit;cursor:pointer;background:0 0;border:0;padding:0;flex:1;min-width:0;display:flex;align-items:center;gap:6px;color:inherit;text-align:left}
.sa_trailChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.sa_trailChevronOpen{transform:rotate(180deg)}
.sa_trailLocate{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:1px 8px;font-size:11px;line-height:1.5;flex:none}
.sa_trailLocate:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.sa_trailItemBody{display:flex;flex-direction:column;gap:4px;margin-top:4px;padding-top:4px;border-top:1px dashed var(--dsw-alias-border-l2);animation:sa-fade-in .16s ease}
.sa_trailRow{display:flex;gap:8px;min-width:0}
.sa_trailRowLabel{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;line-height:1.5}
.sa_trailSummary{color:var(--dsw-alias-label-primary);word-break:break-all;font-size:12px;line-height:1.5}
.sa_trailReason{color:var(--dsw-alias-label-secondary);word-break:break-all;font-size:12px;line-height:1.5}
.sa_trailDetail{color:var(--dsw-alias-label-secondary);word-break:break-all;font-size:12px;line-height:1.5}
.sa_trailCallId{font-family:var(--ds-font-family-code,ui-monospace,SF Mono,Menlo,Consolas,monospace)}
.sa_trailLlmInput{font-family:var(--ds-font-family-code,ui-monospace,SF Mono,Menlo,Consolas,monospace);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto;color:var(--dsw-alias-label-secondary)}
@keyframes sa-fade-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.sa_trailItemBody{animation:none}}
.sa_combo{position:relative;min-width:0}
.sa_comboInput{width:100%;box-sizing:border-box;padding-right:26px}
.sa_comboCaret{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1}
.sa_comboList{position:absolute;z-index:40;top:calc(100% + 4px);left:0;right:0;margin:0;padding:4px;list-style:none;max-height:240px;overflow:auto;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 8px 24px #00000026}
.sa_comboItem button{display:block;width:100%;padding:6px 10px;border:0;background:0 0;text-align:left;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);border-radius:6px;cursor:pointer}
.sa_comboItem button:hover{background:var(--dsw-alias-bg-module-platform)}`;
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
  llmApi;
  /** 可配置 provider → settingsNs 映射（discoverModels 的第一参数；随 fetchModelCatalog 刷新）。 */
  discoveryNamespaces = /* @__PURE__ */ new Map();
  constructor(settingsSource, llmApi) {
    this.llmApi = llmApi;
    this.form = new CardForm(settingsSource, [
      textField("presetName"),
      textField("fullAutoPresetName"),
      selectField("classifierProvider"),
      selectField("classifierModel"),
      textField("classifierEndpoint"),
      textField("classifierPrompt", true),
      numberField("classifierTimeoutMs"),
      numberField("classifierMaxOutputTokens"),
      boolField("classifierRetry"),
      boolField("classifierHttpDisableReasoning"),
      numberField("proposalContextMaxMessageLen"),
      numberField("proposalContextMaxChars"),
      numberField("proposalContextMaxTotalChars"),
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
      classifierHttpDisableReasoning: this.form.field("classifierHttpDisableReasoning"),
      proposalContextMaxMessageLen: this.form.field("proposalContextMaxMessageLen"),
      proposalContextMaxChars: this.form.field("proposalContextMaxChars"),
      proposalContextMaxTotalChars: this.form.field("proposalContextMaxTotalChars"),
      preflight: this.form.field("preflight"),
      showTrail: this.form.field("showTrail")
    };
  }
  inject() {
    const actions = this.form.actions();
    return {
      hooks: { safeAutoCard: this.store },
      ...actions,
      // 成对字段联动重置：classifierProvider/classifierModel 须成对配置，重置其一须同步重置另一，
      // 否则保存时服务端 validateConfig 的成对约束拒绝（fail-closed）。
      resetField: (field) => pairedReset(actions, field),
      setOptions: (field, options) => this.form.setOptions(field, options),
      fetchModelCatalog: () => this.fetchModelCatalog(),
      fetchModels: (provider) => this.fetchModels(provider)
    };
  }
  /**
   * 拉取 provider 路由候选（DSH 宿主 llm.listProviders；alpha.3 起目录只含 id/name，不再携带 models），
   * 并同步刷新「可配置 provider → settingsNs」映射（llm.listConfigurableProviders），
   * 供 fetchModels 调 llm.discoverModels 时按命名空间发现模型候选。
   */
  async fetchModelCatalog() {
    if (this.llmApi === void 0 || typeof this.llmApi.listProviders !== "function") return { providers: [] };
    try {
      const [response, namespaces] = await Promise.all([
        this.llmApi.listProviders(),
        this.fetchDiscoveryNamespaces()
      ]);
      if (response?.ok !== true || !Array.isArray(response.value)) return { providers: [] };
      this.discoveryNamespaces = namespaces;
      return {
        providers: response.value.map((entry) => String(entry.id)).filter((id) => id !== "")
      };
    } catch {
      return { providers: [] };
    }
  }
  /** 从可配置 provider 目录构建 provider → settingsNs 映射（discoverModels 的第一参数）；目录不可用时返回空映射。 */
  async fetchDiscoveryNamespaces() {
    const namespaces = /* @__PURE__ */ new Map();
    if (typeof this.llmApi?.listConfigurableProviders !== "function") return namespaces;
    try {
      const response = await this.llmApi.listConfigurableProviders();
      if (response?.ok !== true || !Array.isArray(response.value)) return namespaces;
      for (const entry of response.value) {
        const provider = entry?.provider;
        const ns = entry?.settingsNs;
        if (typeof provider === "string" && provider !== "" && typeof ns === "string" && ns !== "") {
          namespaces.set(provider, ns);
        }
      }
    } catch {
    }
    return namespaces;
  }
  /**
   * 按 provider 经 llm.discoverModels 拉取模型候选（新目录端点）；旧版宿主无该端点、
   * provider 无 settingsNs 映射或发现失败时返回空列表——候选仅供快速选择，仍可自由输入。
   */
  async fetchModels(provider) {
    const id = String(provider);
    if (id === "" || typeof this.llmApi?.discoverModels !== "function") return [];
    const ns = this.discoveryNamespaces.get(id);
    if (ns === void 0) return [];
    try {
      const response = await this.llmApi.discoverModels(ns, { provider: id });
      if (response?.ok !== true || !Array.isArray(response.value)) return [];
      return response.value.map((entry) => String(entry.id)).filter((modelId) => modelId !== "");
    } catch {
      return [];
    }
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
  }) : props.combo ? (0, import_jsx_runtime.jsx)(ComboInput, {
    id: props.id,
    text: props.text,
    options: props.options,
    placeholder: props.placeholder ?? "",
    disabled: props.disabled,
    onEdit: props.onEdit
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
          (0, import_jsx_runtime.jsxs)("label", { className: "sa_label", htmlFor: props.id, children: [
            props.dirty ? (0, import_jsx_runtime.jsx)("span", { className: "sa_dirtyDot", title: props.dirtyLabel, "aria-label": props.dirtyLabel }) : null,
            props.label
          ] }),
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
function ComboInput(props) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const rootRef = (0, import_react.useRef)(null);
  const options = Array.isArray(props.options) ? props.options : [];
  const text = props.text ?? "";
  const candidates = options.filter((option) => option !== text && (text === "" || option.includes(text)));
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const onDown = (event) => {
      const root = rootRef.current;
      const target = event.target;
      if (root !== null && target instanceof Node && !root.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const onBlur = (event) => {
    const root = rootRef.current;
    if (root === null) return;
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !root.contains(next)) setOpen(false);
  };
  return (0, import_jsx_runtime.jsxs)("div", {
    ref: rootRef,
    className: "sa_combo",
    onBlur,
    children: [
      (0, import_jsx_runtime.jsx)("input", {
        id: props.id,
        className: "sa_input sa_comboInput",
        type: "text",
        value: text,
        placeholder: props.placeholder ?? "",
        disabled: props.disabled,
        autoComplete: "off",
        onChange: (event) => {
          props.onEdit(event.target.value);
          setOpen(true);
        },
        onFocus: () => setOpen(true)
      }),
      (0, import_jsx_runtime.jsx)("span", { className: "sa_comboCaret", children: "\u25BE" }),
      open && candidates.length > 0 ? (0, import_jsx_runtime.jsxs)("ul", {
        className: "sa_comboList",
        role: "listbox",
        children: candidates.map((option) => (0, import_jsx_runtime.jsx)("li", {
          key: option,
          className: "sa_comboItem",
          children: (0, import_jsx_runtime.jsx)("button", {
            type: "button",
            onClick: () => {
              props.onEdit(option);
              setOpen(false);
            },
            children: option
          })
        }))
      }) : null
    ]
  });
}
function SafeAutoCard(props) {
  const { t } = props;
  const state = props.useSafeAutoCard((snapshot) => snapshot);
  const [open, setOpen] = (0, import_react.useState)(false);
  const currentProvider = state.classifierProvider?.text ?? "";
  injectCss();
  (0, import_react.useEffect)(() => {
    if (!open) return;
    void props.fetchModelCatalog().then((catalog) => {
      props.setOptions("classifierProvider", catalog.providers);
    });
  }, [open]);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    let stale = false;
    if (currentProvider === "") {
      props.setOptions("classifierModel", []);
      return;
    }
    void props.fetchModels(currentProvider).then((models) => {
      if (!stale) props.setOptions("classifierModel", models);
    });
    return () => {
      stale = true;
    };
  }, [open, currentProvider]);
  if (!state.available) return null;
  const disabled = !state.writable;
  const blocked = !state.dirty || state.invalid || state.saving;
  const fields = [
    { key: "preflight", label: t("preflight"), hint: t("preflightHint"), bool: true },
    { key: "presetName", label: t("presetName"), hint: t("presetNameHint") },
    { key: "fullAutoPresetName", label: t("fullAutoPresetName"), hint: t("fullAutoPresetNameHint") },
    { key: "classifierProvider", label: t("classifierProvider"), hint: t("classifierProviderHint"), combo: true },
    { key: "classifierModel", label: t("classifierModel"), hint: t("classifierModelHint"), combo: true },
    { key: "classifierEndpoint", label: t("classifierEndpoint"), hint: t("classifierEndpointHint") },
    { key: "classifierPrompt", label: t("classifierPrompt"), hint: t("classifierPromptHint"), multiline: true },
    { key: "classifierTimeoutMs", label: t("classifierTimeoutMs"), hint: t("classifierTimeoutMsHint") },
    { key: "classifierMaxOutputTokens", label: t("classifierMaxOutputTokens"), hint: t("classifierMaxOutputTokensHint") },
    { key: "classifierRetry", label: t("classifierRetry"), hint: t("classifierRetryHint"), bool: true },
    { key: "classifierHttpDisableReasoning", label: t("classifierHttpDisableReasoning"), hint: t("classifierHttpDisableReasoningHint"), bool: true },
    { key: "proposalContextMaxMessageLen", label: t("proposalContextMaxMessageLen"), hint: t("proposalContextMaxMessageLenHint") },
    { key: "proposalContextMaxChars", label: t("proposalContextMaxChars"), hint: t("proposalContextMaxCharsHint") },
    { key: "proposalContextMaxTotalChars", label: t("proposalContextMaxTotalChars"), hint: t("proposalContextMaxTotalCharsHint") },
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
            combo: f.combo === true,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalidLabel: t("invalid"),
            dirtyLabel: t("dirtyLabel"),
            disabled,
            ...state[f.key],
            onEdit: (text) => props.edit(f.key, text),
            onReset: () => props.resetField(f.key)
          })),
          (0, import_jsx_runtime.jsxs)("div", {
            className: "sa_footer",
            children: [
              state.failed ? (0, import_jsx_runtime.jsx)("p", { className: "sa_failed", children: state.failedMessage || t("saveFailed") }) : null,
              state.saved ? (0, import_jsx_runtime.jsx)("p", { className: "sa_saved", children: t("saved") }) : null,
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
              (0, import_jsx_runtime.jsx)("span", { className: "sa_trailBadge sa_trailBadge--" + record.decision, children: decisionText }),
              (0, import_jsx_runtime.jsx)("span", { className: "sa_trailLayer", children: record.layer }),
              (0, import_jsx_runtime.jsx)("span", { className: "sa_trailTool", title: record.toolName, children: record.toolName }),
              (0, import_jsx_runtime.jsx)("span", { className: "sa_trailTime", children: formatTime(record.time) }),
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
          (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: "callId" }), (0, import_jsx_runtime.jsx)("span", { className: "sa_trailDetail sa_trailCallId", children: record.callId })] }),
          (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: t("timeLabel") }), (0, import_jsx_runtime.jsx)("span", { className: "sa_trailDetail", children: formatTime(record.time) })] }),
          (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: t("durationLabel") }), (0, import_jsx_runtime.jsx)("span", { className: "sa_trailDetail", children: formatDuration(record.durationMs) })] }),
          record.tokenUsage ? (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: t("tokenUsageLabel") }), (0, import_jsx_runtime.jsx)("span", { className: "sa_trailDetail", children: `${t("tokenCachedInput")} ${record.tokenUsage.cachedInputTokens} \xB7 ${t("tokenUncachedInput")} ${record.tokenUsage.uncachedInputTokens} \xB7 ${t("tokenOutput")} ${record.tokenUsage.outputTokens}` })] }) : null,
          record.classifierInput ? (0, import_jsx_runtime.jsxs)("div", { className: "sa_trailRow", children: [(0, import_jsx_runtime.jsx)("span", { className: "sa_trailRowLabel", children: t("classifierInputLabel") }), (0, import_jsx_runtime.jsx)("pre", { className: "sa_trailDetail sa_trailLlmInput", children: JSON.stringify(record.classifierInput, null, 2) })] }) : null
        ]
      }) : record.summary ? (0, import_jsx_runtime.jsx)("div", { className: "sa_trailPreview", title: record.summary, children: record.summary }) : null
    ]
  });
}
function TrailPanel(props) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const { t, useTrail, setShowAll } = props;
  const snapshot = useTrail((s) => s) ?? {};
  if (snapshot.enabled === false) return null;
  const records = Array.isArray(snapshot.records) ? snapshot.records : [];
  if (records.length === 0) return null;
  const window = records.slice(-50);
  const stats = window.reduce((acc, r) => {
    acc[r.decision] = (acc[r.decision] ?? 0) + 1;
    return acc;
  }, { allow: 0, deny: 0, ask: 0 });
  const lastDecision = window[window.length - 1]?.decision;
  const locate = (callId) => {
    const el = Array.from(document.querySelectorAll("[data-chat-call-id]")).find((node) => node.getAttribute("data-chat-call-id") === callId);
    if (el !== void 0) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  return (0, import_jsx_runtime.jsxs)("div", {
    className: "sa_trail",
    children: [
      (0, import_jsx_runtime.jsxs)("button", {
        type: "button",
        className: "sa_trailToggle",
        onClick: () => setOpen(!open),
        children: [
          (0, import_jsx_runtime.jsx)("span", { className: "sa_trailToggleDot sa_trailToggleDot--" + lastDecision, "aria-hidden": true }),
          (open ? t("trailCollapse") : t("trailTitle")) + " \xB7 " + window.length,
          (0, import_jsx_runtime.jsxs)("span", {
            className: "sa_trailToggleStats",
            children: [
              (0, import_jsx_runtime.jsx)("span", { className: "sa_trailToggleStat sa_trailToggleStat--allow", title: t("decisionAllow"), children: "\u2713" + stats.allow }),
              (0, import_jsx_runtime.jsx)("span", { className: "sa_trailToggleStat sa_trailToggleStat--deny", title: t("decisionDeny"), children: "\u2717" + stats.deny }),
              (0, import_jsx_runtime.jsx)("span", { className: "sa_trailToggleStat sa_trailToggleStat--ask", title: t("decisionAsk"), children: "?" + stats.ask })
            ]
          })
        ]
      }),
      open ? (0, import_jsx_runtime.jsxs)("div", {
        className: "sa_trailPanel",
        children: [
          (0, import_jsx_runtime.jsxs)("div", {
            className: "sa_trailTabs",
            children: [
              (0, import_jsx_runtime.jsx)("button", {
                type: "button",
                className: "sa_trailTab" + (snapshot.showAll ? "" : " sa_trailTab--active"),
                onClick: () => setShowAll(false),
                children: t("trailScopeSession")
              }),
              (0, import_jsx_runtime.jsx)("button", {
                type: "button",
                className: "sa_trailTab" + (snapshot.showAll ? " sa_trailTab--active" : ""),
                onClick: () => setShowAll(true),
                children: t("trailScopeAll")
              })
            ]
          }),
          (0, import_jsx_runtime.jsx)("ul", {
            className: "sa_trailList",
            children: window.slice().reverse().map((record) => (0, import_jsx_runtime.jsx)(TrailItem, {
              key: String(record.seq),
              record,
              onLocate: locate,
              t
            }))
          })
        ]
      }) : null
    ]
  });
}
var inject = ["slots", "locale", "connection", "sessions", "remote", "remote.settings", "remote.llm"];
function apply(ctx) {
  injectCss();
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), "autogate: card dictionaries");
  const t = ctx.locale.bind(SETTINGS_NS);
  const rpc = ctx.connection?.rpc;
  const llmApi = ctx.remote.llm;
  const settingsSource = new ApiSettingsSource(ctx.remote.settings, SETTINGS_NS);
  const controller = new SafeAutoCardController(settingsSource, llmApi);
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    key: SETTINGS_NS,
    locale: SETTINGS_NS,
    inject: () => controller.inject()
  }, SafeAutoCard));
  const trailController = new TrailController(rpc, settingsSource, ctx.sessions);
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
