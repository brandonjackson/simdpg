export {
  ApiError,
  createErrorHandler,
  badRequest,
  notFound,
  conflict,
  unprocessable,
} from "./errors.js";
export type { ErrorEnvelope } from "./errors.js";

export { requestId } from "./request-id.js";

export { getPagination, listResponse } from "./pagination.js";
export type {
  Pagination,
  ListMeta,
  ListResponse,
} from "./pagination.js";

export {
  buildWebhookEvent,
  deliverWebhook,
  deliverWebhookToTargets,
} from "./webhooks.js";
export type {
  WebhookEvent,
  DeliveryStatus,
  DeliveryResult,
} from "./webhooks.js";

export {
  BEHAVIOR_FIELDS,
  BEHAVIOR_OFF,
  BEHAVIOR_PRESETS,
  behaviorPreset,
  behaviorPresetLabel,
  describeBehavior,
  getBehaviorValue,
  hasLatency,
  isBehaviorOff,
  matchBehaviorPreset,
  parseBehavior,
  sampleLatencyMs,
  setBehaviorValue,
} from "./behavior.js";
export type {
  BehaviorConfig,
  BehaviorFieldDescriptor,
  BehaviorFieldKind,
  BehaviorLatency,
  BehaviorPreset,
  BehaviorRateLimit,
} from "./behavior.js";

export {
  BehaviorController,
  DEFAULT_BEHAVIOR_SKIP_PREFIXES,
  behaviorMiddleware,
  behaviorRouter,
  createBehavior,
} from "./behavior-runtime.js";
export type {
  ApplyBehaviorOptions,
  BehaviorCounters,
  BehaviorHarness,
  BehaviorState,
  CreateBehaviorOptions,
} from "./behavior-runtime.js";

export { ensureColumn, tableColumns } from "./migrations.js";
export type { SqliteLike } from "./migrations.js";

export { docsHtml } from "./docs.js";
