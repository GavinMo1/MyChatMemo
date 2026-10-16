import { ActionType, type RequestAction, type RequestMessage } from './protocol';

type RecordValue = Record<string, unknown>;
export type PayloadValidator = (payload: unknown) => boolean;
export type RequestValidators = Record<RequestAction, PayloadValidator>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isNullableId = (value: unknown): boolean => value === null || isId(value);
const isIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isIds = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0 && Array.from(value).every(isId);
const hasOnly = (value: RecordValue, keys: string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));
const optional = (value: unknown, check: (value: unknown) => boolean): boolean =>
  value === undefined || check(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const noPayload: PayloadValidator = (payload) =>
  payload === undefined || (isRecord(payload) && Object.keys(payload).length === 0);
const conversationPayload: PayloadValidator = (payload) =>
  isRecord(payload) && hasOnly(payload, ['conversationId']) && isId(payload.conversationId);

function syncPayload(payload: unknown): boolean {
  if (
    !isRecord(payload) ||
    !hasOnly(payload, ['url', 'platform', 'conversationId', 'title', 'currentMessages', 'snapshot'])
  )
    return false;
  if (
    !isId(payload.conversationId) ||
    !isString(payload.url) ||
    !isString(payload.title) ||
    !isString(payload.platform) ||
    !['kimi', 'chatgpt', 'claude', 'doubao', 'gemini'].includes(payload.platform) ||
    !optional(payload.snapshot, (value) => value === 'partial' || value === 'complete') ||
    !Array.isArray(payload.currentMessages)
  )
    return false;

  let previousPosition = -1;
  return Array.from(payload.currentMessages).every((message: unknown) => {
    if (
      !isRecord(message) ||
      !hasOnly(message, ['hashId', 'sender', 'content', 'thinking', 'position']) ||
      !isString(message.hashId) ||
      (message.sender !== 'user' && message.sender !== 'assistant') ||
      !isString(message.content) ||
      !optional(message.thinking, isString) ||
      !isIndex(message.position) ||
      message.position <= previousPosition
    )
      return false;
    previousPosition = message.position;
    return true;
  });
}

// Every background request must have a validator before its handler can run.
// Background-to-content commands are deliberately not accepted as requests.
const validators: RequestValidators = {
  [ActionType.CS_REQ_SYNC_MESSAGES]: syncPayload,
  [ActionType.CS_REQ_QUERY_CONVERSATION]: conversationPayload,
  [ActionType.SB_REQ_LIST_CONVERSATIONS]: noPayload,
  [ActionType.SB_REQ_GET_CONVERSATION]: conversationPayload,
  [ActionType.SB_REQ_DELETE_CONVERSATION]: conversationPayload,
  [ActionType.SB_REQ_EXPORT_DATA]: conversationPayload,
  [ActionType.SB_REQ_DELETE_MESSAGE]: (payload) =>
    isRecord(payload) &&
    hasOnly(payload, ['conversationId', 'messageId']) &&
    isId(payload.conversationId) &&
    isId(payload.messageId),
  [ActionType.SB_REQ_BATCH_DELETE_CONVERSATIONS]: (payload) =>
    isRecord(payload) && hasOnly(payload, ['conversationIds']) && isIds(payload.conversationIds),
  [ActionType.SB_REQ_EXPORT_CONVERSATIONS_ZIP]: (payload) =>
    isRecord(payload) &&
    hasOnly(payload, ['conversationIds', 'flatten']) &&
    isIds(payload.conversationIds) &&
    optional(payload.flatten, (value) => typeof value === 'boolean'),
  [ActionType.SB_REQ_MOVE_CONVERSATIONS]: (payload) =>
    isRecord(payload) &&
    hasOnly(payload, ['conversationIds', 'folderId']) &&
    isIds(payload.conversationIds) &&
    isNullableId(payload.folderId),
  [ActionType.SB_REQ_SEARCH_CONVERSATIONS]: (payload) =>
    isRecord(payload) &&
    hasOnly(payload, ['keyword', 'offset', 'limit', 'folderId', 'showAll']) &&
    isString(payload.keyword) &&
    isIndex(payload.offset) &&
    isIndex(payload.limit) &&
    payload.limit > 0 &&
    isNullableId(payload.folderId) &&
    typeof payload.showAll === 'boolean',
  [ActionType.SB_REQ_LIST_FOLDERS]: noPayload,
  [ActionType.SB_REQ_CREATE_FOLDER]: (payload) =>
    isRecord(payload) &&
    hasOnly(payload, ['name', 'parentId']) &&
    isId(payload.name) &&
    isNullableId(payload.parentId),
  [ActionType.SB_REQ_UPDATE_FOLDER]: (payload) =>
    isRecord(payload) &&
    hasOnly(payload, ['id', 'name', 'parentId', 'order']) &&
    isId(payload.id) &&
    optional(payload.name, isId) &&
    optional(payload.parentId, isNullableId) &&
    optional(payload.order, isIndex) &&
    ['name', 'parentId', 'order'].some((key) => payload[key] !== undefined) &&
    payload.parentId !== payload.id,
  [ActionType.SB_REQ_DELETE_FOLDER]: (payload) =>
    isRecord(payload) && hasOnly(payload, ['id']) && isId(payload.id),
};

export type RequestValidation =
  | { valid: true; message: RequestMessage }
  | { valid: false; error: string };

/** Pure validation: malformed input is rejected before any database or Chrome API call. */
export function validateBackgroundRequest(input: unknown): RequestValidation {
  if (
    !isRecord(input) ||
    typeof input.type !== 'string' ||
    typeof input.timestamp !== 'number' ||
    !Number.isFinite(input.timestamp) ||
    input.timestamp < 0
  ) {
    return { valid: false, error: '无效的 IPC 消息' };
  }
  if (!isRequestAction(input.type)) return { valid: false, error: `未知动作: ${input.type}` };
  const validate = validators[input.type];
  if (!validate(input.payload)) return { valid: false, error: `无效的请求参数: ${input.type}` };
  // Chrome 边界传入 unknown；动作已属于穷尽表，且相应 payload 校验已通过。
  // 此处统一恢复判别联合，后续路由无需逐项断言 payload。
  return { valid: true, message: input as RequestMessage };
}

function isRequestAction(action: string): action is RequestAction {
  return Object.prototype.hasOwnProperty.call(validators, action);
}
