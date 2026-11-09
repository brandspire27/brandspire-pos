import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, type Client, type InValue, type Transaction } from '@libsql/client';

@Injectable()
export class TursoService implements OnModuleDestroy {
  private readonly client: Client;

  constructor() {
    const url = (process.env.TURSO_DATABASE_URL ?? '').trim();
    const authToken = (process.env.TURSO_AUTH_TOKEN ?? '').trim();
    if (!url || !authToken) {
      throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required');
    }
    this.client = createClient({ url, authToken });
  }

  execute(sql: string, args: InValue[] = []) {
    return this.client.execute({ sql, args });
  }

  async transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    const transaction = await this.client.transaction('write');
    try {
      const result = await work(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }

  async onModuleDestroy() {
    this.client.close();
  }
}
