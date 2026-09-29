import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  readonly admin: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in apps/api/.env');
    }

    this.admin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
}
