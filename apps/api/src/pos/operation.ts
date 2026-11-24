import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Transaction } from '@libsql/client';
import { z } from 'zod';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export async function once<T>(tx: Transaction, organizationId: string, userId: string, action: string, target: string, input: unknown, work: () => Promise<T>): Promise<T> {
  const parsed = z.object({ operationId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) throw new BadRequestException('A valid operationId is required. Update the app and retry.');
  const id = parsed.data.operationId;
  const hash = createHash('sha256').update(canonical({ userId, action, target, input })).digest('hex');
  const result = await tx.execute({sql:'SELECT request_hash, response_json FROM pos_operations WHERE organization_id = ? AND operation_id = ?',args:[organizationId,id]});
  if (result.rows.length) {
    if (result.rows[0].request_hash !== hash) throw new ConflictException('This operation ID was already used for different details.');
    return JSON.parse(String(result.rows[0].response_json)) as T;
  }
  const response = await work();
  await tx.execute({sql:'INSERT INTO pos_operations(organization_id,operation_id,request_hash,response_json) VALUES (?,?,?,?)',args:[organizationId,id,hash,JSON.stringify(response)]});
  return response;
}
