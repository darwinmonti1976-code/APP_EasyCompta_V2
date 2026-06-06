import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Verify the user's JWT via the anon client
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const userId    = user.id;
    const userEmail = user.email ?? '';
    const admin     = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Find workspaces owned by this user
    const { data: ownedWs } = await admin
      .from('workspaces')
      .select('id')
      .eq('owner_id', userId);
    const ownedIds = (ownedWs ?? []).map((w: { id: string }) => w.id);

    // 2. Delete all transactions created by the user (any workspace)
    await admin.from('transactions').delete().eq('user_id', userId);

    // 3. Cascade-delete everything inside owned workspaces
    if (ownedIds.length > 0) {
      await admin.from('transactions').delete().in('workspace_id', ownedIds);
      await admin.from('budgets').delete().in('workspace_id', ownedIds);
      await admin.from('workspace_members').delete().in('workspace_id', ownedIds);
      await admin.from('workspaces').delete().in('id', ownedIds);
    }

    // 4. Remove user's membership/invitations in other workspaces
    await admin.from('workspace_members').delete().eq('user_id', userId);
    if (userEmail) {
      await admin.from('workspace_members').delete().eq('invited_email', userEmail);
    }

    // 5. Delete receipt photos from storage
    const { data: files } = await admin.storage
      .from('transaction-photos')
      .list(userId);
    if (files && files.length > 0) {
      const paths = files.map((f: { name: string }) => `${userId}/${f.name}`);
      await admin.storage.from('transaction-photos').remove(paths);
    }

    // 6. Delete the auth user (must be last)
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('deleteUser error:', deleteError);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
