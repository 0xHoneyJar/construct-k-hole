/**
 * Zero-dependency validators for the grounded-result + error contracts (FR-1).
 *
 * We do NOT pull a JSON-schema library (repo idiom is zero runtime deps). Instead
 * these focused validators check the exact shapes the vendored draft-07 schemas
 * describe, and derive their enum/required lists FROM the loaded schema JSON so the
 * schema files remain the single source of truth (drift is caught by contract.test.ts).
 *
 * Validators take the SNAKE_CASE wire object (post-JSON.parse, pre-fromWire).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, "schemas");

function loadSchema(name: string): Record<string, any> {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8"));
}

export const groundedResultSchema = loadSchema("grounded-result-v1.json");
export const errorSchema = loadSchema("error-v1.json");
export const requestSchema = loadSchema("request-v1.json");

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkRequired(
  obj: Record<string, unknown>,
  required: string[],
  path: string,
  errors: string[],
): void {
  for (const key of required) {
    if (!(key in obj)) errors.push(`${path}: missing required field '${key}'`);
  }
}

/** Validate a snake_case grounded-result wire object against grounded-result-v1. */
export function validateGroundedResultWire(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(obj)) return { valid: false, errors: ["root: not an object"] };

  checkRequired(obj, groundedResultSchema.required as string[], "grounded-result", errors);

  if ("text" in obj && typeof obj.text !== "string") errors.push("text: must be string");

  if ("citations" in obj) {
    if (!Array.isArray(obj.citations)) {
      errors.push("citations: must be array");
    } else {
      (obj.citations as unknown[]).forEach((c, i) => {
        if (!isObject(c)) {
          errors.push(`citations[${i}]: not an object`);
          return;
        }
        checkRequired(c, ["title", "url", "snippet"], `citations[${i}]`, errors);
        for (const f of ["title", "url", "snippet"] as const) {
          if (f in c && typeof c[f] !== "string") errors.push(`citations[${i}].${f}: must be string`);
        }
      });
    }
  }

  if ("executed_queries" in obj && !Array.isArray(obj.executed_queries)) {
    errors.push("executed_queries: must be array");
  }

  const provEnum = groundedResultSchema.properties.grounding_provenance.enum as string[];
  if ("grounding_provenance" in obj && !provEnum.includes(obj.grounding_provenance as string)) {
    errors.push(`grounding_provenance: '${String(obj.grounding_provenance)}' not in [${provEnum.join(", ")}]`);
  }

  if ("lane" in obj) {
    const laneEnum = groundedResultSchema.properties.lane.enum as string[];
    if (!laneEnum.includes(obj.lane as string)) {
      errors.push(`lane: '${String(obj.lane)}' not in [${laneEnum.join(", ")}]`);
    }
  }

  if ("latency_ms" in obj && (!Number.isInteger(obj.latency_ms) || (obj.latency_ms as number) < 0)) {
    errors.push("latency_ms: must be integer >= 0");
  }

  if ("quality" in obj) {
    if (!isObject(obj.quality)) {
      errors.push("quality: must be object");
    } else {
      const q = obj.quality;
      checkRequired(q, groundedResultSchema.properties.quality.required as string[], "quality", errors);
      if ("coverage_estimate" in q) {
        const ce = q.coverage_estimate;
        if (typeof ce !== "number" || ce < 0 || ce > 1) errors.push("quality.coverage_estimate: must be number in [0,1]");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validate an error envelope against error-v1. */
export function validateErrorWire(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(obj)) return { valid: false, errors: ["root: not an object"] };
  if (obj.ok !== false) errors.push("ok: must be literal false");
  if (!isObject(obj.error)) {
    errors.push("error: must be object");
    return { valid: false, errors };
  }
  const err = obj.error;
  checkRequired(err, ["code", "message", "retryable"], "error", errors);
  const codeEnum = errorSchema.properties.error.properties.code.enum as string[];
  if ("code" in err && !codeEnum.includes(err.code as string)) {
    errors.push(`error.code: '${String(err.code)}' not a known code`);
  }
  if ("retryable" in err && typeof err.retryable !== "boolean") {
    errors.push("error.retryable: must be boolean");
  }
  return { valid: errors.length === 0, errors };
}
