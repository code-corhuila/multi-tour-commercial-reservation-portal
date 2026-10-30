import { PortalApiClient } from '../src/app/shell-contract';

export interface Call { path: string; method?: string; body?: unknown; headers?: Record<string, string> }

/** A fake container client: records every request and answers with the next queued reply or rejection (the last reply repeats nothing: `{}` after the queue). */
export function fakeClient(...replies: Array<{ ok: unknown } | { fail: unknown }>) {
  const calls: Call[] = [];
  const client: PortalApiClient = {
    request: ((path: string, init?: Omit<Call, 'path'>) => {
      calls.push({ path, ...init });
      const reply = replies.shift() ?? { ok: {} };
      return 'fail' in reply ? Promise.reject(reply.fail) : Promise.resolve(reply.ok);
    }) as PortalApiClient['request'],
  };
  return { client, calls };
}
export const page = <T>(data: readonly T[]) => ({ data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } });
