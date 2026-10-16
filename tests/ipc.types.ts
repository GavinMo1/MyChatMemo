// 只参与 npm run typecheck，不匹配 Vitest 的 *.test.ts，绝不执行这些请求。
// 每个 @ts-expect-error 都是协议的编译期反例；失去约束时 tsc 会因指令未使用而失败。
import { expectTypeOf } from 'vitest';
import { sendRequest } from '@/browser/ipc';
import {
  ActionType,
  type IPCRequestMap,
  type RequestAction,
  type RequestArguments,
  type RequestHandlers,
  type RequestMessage,
  type RequestResponse,
} from '@/shared/protocol';
import type { RequestValidators } from '@/shared/protocolValidation';
import type { ConversationMeta, ConversationWithMessages, Folder } from '@/types';

export function verifyIPCContractTypes(
  dynamicAction: ActionType.SB_REQ_GET_CONVERSATION | ActionType.SB_REQ_CREATE_FOLDER
): void {
  expectTypeOf<keyof IPCRequestMap>().toEqualTypeOf<RequestAction>();
  expectTypeOf(
    sendRequest(ActionType.SB_REQ_GET_CONVERSATION, { conversationId: 'id' })
  ).toEqualTypeOf<Promise<ConversationWithMessages | null>>();
  expectTypeOf(
    sendRequest(ActionType.CS_REQ_QUERY_CONVERSATION, { conversationId: 'id' })
  ).toEqualTypeOf<Promise<ConversationMeta | null>>();
  expectTypeOf(sendRequest(ActionType.SB_REQ_LIST_FOLDERS)).toEqualTypeOf<Promise<Folder[]>>();
  expectTypeOf(sendRequest(ActionType.SB_REQ_DELETE_FOLDER, { id: 'folder' })).toEqualTypeOf<
    Promise<void>
  >();
  // 旧 wire 允许无参数操作附带空对象。
  void sendRequest(ActionType.SB_REQ_LIST_FOLDERS, {});

  // @ts-expect-error 有参数的请求不能省略参数。
  void sendRequest(ActionType.SB_REQ_GET_CONVERSATION);
  // @ts-expect-error 动作决定 payload，不能把文件夹参数传给对话查询。
  void sendRequest(ActionType.SB_REQ_GET_CONVERSATION, { name: 'folder', parentId: null });
  // @ts-expect-error 无参数请求不能携带对话查询参数。
  void sendRequest(ActionType.SB_REQ_LIST_FOLDERS, { conversationId: 'id' });
  // @ts-expect-error 后台向内容脚本的命令不是客户端请求。
  void sendRequest(ActionType.BG_CMD_UPDATE_BADGE_STATE, { state: 'success' });
  // @ts-expect-error 不接受调用方任意指定返回类型的 send<string> 模式。
  void sendRequest<string>(ActionType.SB_REQ_GET_CONVERSATION, { conversationId: 'id' });
  // @ts-expect-error union 动作尚未收窄，不能与其中某个动作的参数强行配对。
  void sendRequest(dynamicAction, { conversationId: 'id' });
  // @ts-expect-error 即使显式指定所有请求的元组联合，错误的配对也不成立。
  void sendRequest<RequestArguments>(ActionType.SB_REQ_DELETE_FOLDER, { conversationId: 'id' });

  // @ts-expect-error 查询结果不能自行视为字符串。
  const wrongResult: Promise<string> = sendRequest(ActionType.SB_REQ_GET_CONVERSATION, {
    conversationId: 'id',
  });
  const wrongMessage: RequestMessage = {
    type: ActionType.SB_REQ_DELETE_FOLDER,
    // @ts-expect-error 消息联合保留了动作和参数的对应关系。
    payload: { conversationId: 'id' },
    timestamp: 0,
  };
  // @ts-expect-error 需要数据的成功响应不能省略 data。
  const missingData: RequestResponse<ActionType.SB_REQ_GET_CONVERSATION> = { status: 'ok' };
  // @ts-expect-error handler 必须返回其动作约定的数据。
  const wrongHandler: RequestHandlers[ActionType.SB_REQ_LIST_FOLDERS] = async () => ({
    status: 'ok',
    data: 'incorrect',
  });
  // @ts-expect-error handler 表不允许遗漏任何请求动作。
  const missingHandlers: RequestHandlers = {};
  // @ts-expect-error 运行时校验表不允许遗漏任何请求动作。
  const missingValidators: RequestValidators = {};
  void [wrongResult, wrongMessage, missingData, wrongHandler, missingHandlers, missingValidators];
}
