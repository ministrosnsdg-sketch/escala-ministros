// supabase/functions/reset-password/index.ts
//
// Redefine a senha do usuário para "123456" e marca must_reset_password = true
// para que, ao fazer login, o sistema solicite a troca imediata.
//
// Deploy: npx supabase functions deploy reset-password
// Variáveis necessárias (já existem por padrão no Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json() as { email: string };

    if (!email || !email.trim()) {
      return new Response(
        JSON.stringify({ error: "Informe o e-mail para redefinir a senha." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Cliente com service_role para poder alterar senhas e dados de qualquer usuário
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Buscar o usuário pelo e-mail na tabela auth.users
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return new Response(
        JSON.stringify({ error: "Erro ao buscar usuários." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUser = listData.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (!authUser) {
      // Por segurança, retornamos mensagem genérica de sucesso mesmo se não encontrar
      // (evita enumeração de e-mails cadastrados)
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Redefinir a senha para "123456"
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      authUser.id,
      { password: "123456" }
    );

    if (updateAuthError) {
      return new Response(
        JSON.stringify({ error: "Erro ao redefinir a senha." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Marcar must_reset_password = true na tabela ministers
    //    Tenta pelo user_id primeiro; se não achar, tenta pelo e-mail
    const { data: ministerByUserId } = await supabase
      .from("ministers")
      .select("id")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (ministerByUserId) {
      await supabase
        .from("ministers")
        .update({ must_reset_password: true })
        .eq("user_id", authUser.id);
    } else {
      // Fallback: busca pelo e-mail (campo email na tabela ministers)
      await supabase
        .from("ministers")
        .update({ must_reset_password: true })
        .eq("email", normalizedEmail);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno no servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
