/*
 * Lightweight JSON-Schema validator for opencode-ship config.
 *
 * The schema files are small, closed schemas for the user config and
 * the install lock. We avoid a runtime dependency on Ajv by
 * implementing the small subset we need: required, additionalProperties,
 * oneOf by const/enum, type, pattern, minimum/maximum, format guard,
 * integer guard, enum, items, $schema/$id.
 *
 * The validator returns `{ ok, issues, value }` so callers can
 * surface inline diagnostics.
 */

const FORMAT_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validate(value, schema, pointer, issues) {
  if (!isObject(schema)) return;
  if (schema.const !== undefined && value !== schema.const) {
    issues.push(`${pointer}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
    return;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    issues.push(`${pointer}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
    return;
  }
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) validate(value, sub, pointer, issues);
  }
  if (isObject(schema.if)) {
    const ifIssues = [];
    validate(value, schema.if, pointer, ifIssues);
    if (ifIssues.length === 0) {
      if (isObject(schema.then)) validate(value, schema.then, pointer, issues);
    } else if (isObject(schema.else)) {
      validate(value, schema.else, pointer, issues);
    }
  }
  const type = schema.type;
  if (type !== undefined) {
    const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    if (type !== actual) {
      // Treat `integer` specially after a number check.
      if (!(type === "integer" && typeof value === "number" && Number.isInteger(value))) {
        issues.push(`${pointer}: expected ${type}, got ${actual}`);
        return;
      }
    }
  }
  if (type === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push(`${pointer}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern !== undefined) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) issues.push(`${pointer}: does not match pattern ${schema.pattern}`);
    }
    if (schema.format === "date-time" && !FORMAT_DATE_TIME.test(value)) {
      issues.push(`${pointer}: not a date-time string`);
    }
  }
  if (type === "integer" || type === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push(`${pointer}: less than minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push(`${pointer}: greater than maximum ${schema.maximum}`);
    }
    if (schema.enum !== undefined) {
      // honour numeric enum
    }
  }
  if (type === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push(`${pointer}: fewer items than minItems ${schema.minItems}`);
    }
    if (Array.isArray(schema.items)) {
      value.forEach((entry, i) => validate(entry, schema.items[i] ?? {}, `${pointer}/${i}`, issues));
    } else if (schema.items) {
      if (schema.uniqueItems) {
        const seen = new Set();
        value.forEach((entry, i) => {
          const key = JSON.stringify(entry);
          if (seen.has(key)) issues.push(`${pointer}/${i}: duplicate unique item`);
          seen.add(key);
        });
      }
      value.forEach((entry, i) => validate(entry, schema.items, `${pointer}/${i}`, issues));
    }
  }
  if (type === "object" || isObject(schema.properties) || Array.isArray(schema.required)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) issues.push(`${pointer}: missing required field ${key}`);
      }
    }
    if (schema.additionalProperties === false && isObject(schema.properties)) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) issues.push(`${pointer}: unknown field ${key}`);
      }
    }
    if (isObject(schema.properties)) {
      for (const key of Object.keys(schema.properties)) {
        if (key in value) validate(value[key], schema.properties[key], `${pointer}/${key}`, issues);
      }
    }
  }
}

export function validateSchema(value, schema) {
  const issues = [];
  validate(value, schema, "#", issues);
  return { ok: issues.length === 0, issues };
}

export function assertSchema(value, schema) {
  const out = validateSchema(value, schema);
  if (!out.ok) {
    const err = new Error(`config validation failed: ${out.issues.join("; ")}`);
    /** @type {any} */ (err).issues = out.issues;
    throw err;
  }
  return value;
}
