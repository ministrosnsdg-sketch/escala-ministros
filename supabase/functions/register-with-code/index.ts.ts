// supabase/functions/register-with-code/index.ts
//
// Cadastra um novo ministro usando um código de convite válido.
// Cria o usuário no Supabase Auth e vincula ao ministro na tabela ministers.
//
// Deploy: npx supabase functions deploy register-with-code
// Variáveis necessárias (já existem por padrão no Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code, name, email, phone, birth_date, password } = await req.json() as {
      code: string;
      name: string;
      email: string;
      phone?: string;
      birth_date?: string;
      password: string;
    };

    if (!code || !name || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Preencha código, nome, e-mail e senha." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Validar o código de convite
    const { data: inviteCode, error: codeError } = await supabase
      .from("invite_codes")
      .select("id, used_count, max_uses, active, expires_at")
      .eq("code", code.trim())
      .maybeSingle();

    if (codeError || !inviteCode) {
      return new Response(
        JSON.stringify({ error: "Código de acesso inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!inviteCode.active) {
      return new Response(
        JSON.stringify({ error: "Este código de acesso está inativo." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (inviteCode.expires_at && new Date(inviteCode.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Este código de acesso expirou." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (inviteCode.used_count >= inviteCode.max_uses) {
      return new Response(
        JSON.stringify({ error: "Este código de acesso atingiu o limite de usos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verificar se e-mail já existe na tabela ministers
    const { data: existingMinister } = await supabase
      .from("ministers")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingMinister) {
      return new Response(
        JSON.stringify({ error: "Este e-mail já está cadastrado no sistema." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Criar usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true, // confirma automaticamente sem precisar de e-mail
    });

    if (authError || !authData.user) {
      const msg = authError?.message?.includes("already registered")
        ? "Este e-mail já está cadastrado no sistema de autenticação."
        : "Não foi possível criar o usuário.";
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = authData.user.id;

    // 4. Inserir na tabela ministers
    const { error: ministerError } = await supabase
      .from("ministers")
      .insert({
        name: name.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || null,
        birth_date: birth_date || null,
        user_id: newUserId,
        is_active: true,
        is_admin: false,
        must_reset_password: false,
      });

    if (ministerError) {
      // Rollback: remover usuário auth criado
      await supabase.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar os dados do ministro." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Incrementar used_count do código de convite
    await supabase
      .from("invite_codes")
      .update({ used_count: inviteCode.used_count + 1 })
      .eq("id", inviteCode.id);

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
