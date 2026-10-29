import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { notInContract } from '../src/app/http/api-paths';

describe('notInContract (the one shared helper)', () => {
  it('fails each subscription with the NOT_IN_CONTRACT error carrying the text as message and userMessage', async () => {
    const what = 'El servicio aún no publica la consulta.';
    await expect(firstValueFrom(notInContract(what))).rejects.toEqual({ status: 0, code: 'NOT_IN_CONTRACT', message: what, details: [], traceId: '', userMessage: what });
  });
});
