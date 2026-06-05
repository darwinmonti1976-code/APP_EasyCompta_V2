import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY         = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL             = Deno.env.get('FROM_EMAIL') ?? 'EasyCompta <noreply@easycompta.app>';

const WS_TYPE_LABELS: Record<string, string> = {
  personal: 'Personnel',
  family:   'Famille',
  business: 'Pro',
};

serve(async (req) => {
  try {
    const payload = await req.json();
    const record  = payload.record;

    // Ignore tout ce qui n'est pas une nouvelle invitation en attente
    if (!record || record.status !== 'pending' || !record.invited_email) {
      return new Response('skipped', { status: 200 });
    }

    const { invited_email, workspace_id } = record;

    // Récupérer le nom du workspace avec le service role (contourne RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name, type')
      .eq('id', workspace_id)
      .single();

    const wsName  = workspace?.name ?? 'un espace partagé';
    const wsType  = WS_TYPE_LABELS[workspace?.type ?? 'personal'];

    const html = buildEmailHtml(wsName, wsType);

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [invited_email],
        subject: `Tu as été invité à rejoindre "${wsName}" sur EasyCompta`,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error ${res.status}: ${body}`);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});

function buildEmailHtml(wsName: string, wsType: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F8F9FF;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:24px;
              padding:40px 32px;box-shadow:0 4px 24px rgba(124,158,255,0.12)">

    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-block;background:#E8EDFF;border-radius:20px;
                  width:72px;height:72px;line-height:72px;font-size:36px">💰</div>
      <h1 style="margin:16px 0 4px;font-size:24px;font-weight:800;color:#2D3748">
        EasyCompta
      </h1>
      <p style="margin:0;font-size:14px;color:#718096">Ton compagnon financier vocal</p>
    </div>

    <p style="font-size:16px;color:#2D3748;line-height:1.6;margin-bottom:8px">
      Tu as été invité à rejoindre l'espace
      <strong style="color:#7C9EFF">${wsName}</strong>
      <span style="font-size:13px;color:#718096">(${wsType})</span>.
    </p>

    <p style="font-size:15px;color:#718096;line-height:1.6">
      Ouvre l'app EasyCompta sur ton téléphone pour accepter ou refuser l'invitation.
      Tu la trouveras dans <strong>Réglages → Invitations en attente</strong>.
    </p>

    <div style="background:#F0F4FF;border-radius:16px;padding:20px;margin:28px 0;text-align:center">
      <p style="margin:0 0 4px;font-size:13px;color:#718096;font-weight:600;
                text-transform:uppercase;letter-spacing:.5px">Espace</p>
      <p style="margin:0;font-size:20px;font-weight:800;color:#7C9EFF">${wsName}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#718096">${wsType}</p>
    </div>

    <p style="font-size:13px;color:#A0AEC0;text-align:center;margin-top:32px;line-height:1.5">
      Si tu ne reconnais pas cet email, tu peux ignorer ce message.<br>
      Aucun compte ne sera créé sans ton accord.
    </p>
  </div>
</body>
</html>`;
}
