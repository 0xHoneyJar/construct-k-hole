/**
 * Grounded-result contract — public surface (SDD §3.1, FR-1).
 *
 * The one contract both lanes (cheval / mcp) emit into. Import from here.
 */
export {
  CONTRACT_VERSION,
  type GroundingProvenance,
  type GroundedLane,
  type Citation,
  type GroundedQuality,
  type GroundedResult,
  type ErrorCode,
  type ErrorEnvelope,
  toWire,
  fromWire,
} from "./types.js";

export {
  validateGroundedResultWire,
  validateErrorWire,
  groundedResultSchema,
  errorSchema,
  requestSchema,
  type ValidationResult,
} from "./validate.js";
