// supabase/functions/send-push/index.ts
// Edge Function para disparar Web Push para todos (ou só admins)
//
// Deploy: npx supabase functions deploy send-push
// Variáveis necessárias no painel do Supabase (Settings > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY   — chave pública VAPID (sem "VITE_" na frente)
//   VAPID_PRIVATE_KEY  — chave privada VAPID
//   VAPID_SUBJECT      — ex: "mailto:seuemail@paroquia.org"
//   SUPABASE_URL       — já existe por padrão
//   SUPABASE_SERVICE_ROLE_KEY — já existe por padrão

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ApplicationServerKeys, generatePushHTTPRequest } from "https://esm.sh/web-push-server@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, message, target, notificationId } = await req.json() as {
      title: string;
      message: string;
      target: "all" | "admins";
      notificationId: string;
    };

    if (!title || !message) {
      return new Response(JSON.stringify({ error: "title e message são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente admin (service role) para ler tokens e atualizar status
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Buscar tokens de push
    let tokenQuery = supabase.from("push_tokens").select("token, user_id, endpoint");

    // Se target = "admins", filtra pelos ministros que têm is_admin = true
    if (target === "admins") {
      const { data: admins } = await supabase
        .from("ministers")
        .select("user_id")
        .eq("is_admin", true)  // campo correto: is_admin (boolean), não role
        .not("user_id", "is", null);

      const adminIds = (admins || []).map((a: any) => a.user_id).filter(Boolean);
      if (adminIds.length === 0) {
        return new Response(JSON.stringify({ sent: 0, total: 0, message: "Nenhum admin com token encontrado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tokenQuery = tokenQuery.in("user_id", adminIds);
    }

    const { data: tokens, error: tokensError } = await tokenQuery;

    if (tokensError) throw tokensError;
    if (!tokens || tokens.length === 0) {
      // Marcar como enviada mesmo sem tokens, para não ficar como pendente
      if (notificationId) {
        await supabase
          .from("admin_notifications")
          .update({ sent: true })
          .eq("id", notificationId);
      }
      return new Response(JSON.stringify({ sent: 0, total: 0, message: "Nenhum dispositivo registrado ainda" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Preparar chaves VAPID
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@paroquia.org";

    if (!vapidPublic || !vapidPrivate) {
      return new Response(JSON.stringify({ error: "Chaves VAPID não configuradas nos secrets do Supabase" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keys = await ApplicationServerKeys.fromJSON({
      publicKey: vapidPublic,
      privateKey: vapidPrivate,
    });

    // 3. Payload da notificação
    const payload = JSON.stringify({
      title,
      body: message,
      url: "/",
    });

    // 4. Disparar para cada token (cada dispositivo cadastrado)
    let sent = 0;
    const expiredEndpoints: string[] = [];
    const failed: string[] = [];

    for (const row of tokens) {
      try {
        const subscription = JSON.parse(row.token);

        if (!subscription.endpoint || !subscription.keys) {
          failed.push(`invalid_token:${row.user_id}`);
          continue;
        }

        const pushRequest = await generatePushHTTPRequest({
          applicationServerKeys: keys,
          payload,
          target: {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          adminContact: vapidSubject,
          ttl: 60 * 60 * 24, // 24 horas
        });

        const pushResponse = await fetch(pushRequest.url, {
          method: pushRequest.method,
          headers: pushRequest.headers,
          body: pushRequest.body,
        });

        if (pushResponse.ok || pushResponse.status === 201) {
          sent++;
        } else if (pushResponse.status === 410 || pushResponse.status === 404) {
          // Subscription expirada — remover do banco para não acumular tokens mortos
          const endpointToDelete = row.endpoint || subscription.endpoint;
          if (endpointToDelete) {
            expiredEndpoints.push(endpointToDelete);
          } else {
            // Fallback: remove pelo user_id (schema antigo)
            await supabase.from("push_tokens").delete().eq("user_id", row.user_id);
          }
          failed.push(`expired:${row.user_id}`);
        } else {
          failed.push(`${pushResponse.status}:${row.user_id}`);
        }
      } catch (e: any) {
        failed.push(`error:${row.user_id}:${e?.message || "?"}`);
      }
    }

    // Remove tokens expirados em lote
    if (expiredEndpoints.length > 0) {
      await supabase.from("push_tokens").delete().in("endpoint", expiredEndpoints);
    }

    // 5. Marcar notificação como enviada
    if (notificationId) {
      await supabase
        .from("admin_notifications")
        .update({ sent: true })
        .eq("id", notificationId);
    }

    return new Response(
      JSON.stringify({
        sent,
        total: tokens.length,
        failed_count: failed.length,
        expired_removed: expiredEndpoints.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
