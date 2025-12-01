import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export const supabase = createClientComponentClient({
  options: {
    realtime: {
      timeout: 20000,
      headers: {
        'Connection': 'keep-alive'
      }
    }
  }
});
