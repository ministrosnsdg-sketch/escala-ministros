// src/pages/Perfil.tsx
import React, { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

type MinisterProfile = {
  id: string;
  name: string | null;
  phone?: string | null;
  is_admin?: boolean | null;
};

const PerfilPage: React.FC = () => {
  return (
    <RequireAuth>
      <Layout>
        <PerfilInner />
      </Layout>
    </RequireAuth>
  );
};

const PerfilInner: React.FC = () => {
  const { user } = useAuth();

  const [minister, setMinister] = useState<MinisterProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // campos editáveis
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // feedback perfil
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // troca de senha
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Carrega (ou cria) o registro de minister vinculado ao user_id atual
  useEffect(() => {
    if (!user) return;

    async function loadOrCreateProfile() {
      setLoading(true);
      setProfileError(null);

      try {
        // tenta achar ministro pelo user_id
        let { data, error } = await supabase
          .from("ministers")
          .select("id, name, phone, is_admin")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Erro ao carregar perfil:", error);
          setProfileError("Não foi possível carregar seus dados.");
          setLoading(false);
          return;
        }

        // se não existe, cria automaticamente um registro vinculado
        if (!data) {
          const displayNameFromEmail =
            (user.email || "").split("@")[0].replace(".", " ");
          const initialName =
            user.user_metadata?.name ||
            displayNameFromEmail ||
            "Ministro";

          const insertPayload: any = {
            user_id: user.id,
            name: initialName,
            active: true,
          };

          const insertResult = await supabase
            .from("ministers")
            .insert(insertPayload)
            .select("id, name, phone, is_admin")
            .single();

          if (insertResult.error) {
            console.error(
              "Erro ao criar registro de ministro para o usuário:",
              insertResult.error
            );
            setProfileError(
              "Não foi possível vincular seu usuário ao cadastro de ministro. Fale com o administrador."
            );
            setLoading(false);
            return;
          }

          data = insertResult.data;
        }

        const ministerData = data as MinisterProfile;
        setMinister(ministerData);
        setName(ministerData.name || "");
        setPhone(ministerData.phone || "");
      } catch (e) {
        console.error(e);
        setProfileError("Erro inesperado ao carregar seus dados.");
      } finally {
        setLoading(false);
      }
    }

    void loadOrCreateProfile();
  }, [user]);

  // Salvar nome + telefone do próprio ministro
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !minister) return;

    setSavingProfile(true);
    setProfileMessage(null);
    setProfileError(null);

    try {
      const updates: Partial<MinisterProfile> = {
        name: name.trim() || null,
        phone: phone.trim() || null,
      };

      const { error } = await supabase
        .from("ministers")
        .update(updates)
        .eq("id", minister.id);

      if (error) {
        console.error("Erro ao salvar perfil:", error);
        setProfileError("Erro ao salvar seus dados. Tente novamente.");
      } else {
        setProfileMessage("Dados atualizados com sucesso.");
        setMinister((prev) =>
          prev
            ? {
                ...prev,
                name: updates.name ?? prev.name,
                phone: updates.phone ?? prev.phone,
              }
            : prev
        );
      }
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMessage(null), 4000);
    }
  }

  // Alterar senha do usuário logado
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setPasswordMessage(null);
    setPasswordError(null);

    if (!password || password.length < 6) {
      setPasswordError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordError("A confirmação de senha não confere.");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        console.error("Erro ao alterar senha:", error);
        setPasswordError(
          "Não foi possível alterar a senha. Tente novamente."
        );
      } else {
        setPasswordMessage("Senha alterada com sucesso.");
        setPassword("");
        setPasswordConfirm("");
      }
    } finally {
      setSavingPassword(false);
      setTimeout(() => setPasswordMessage(null), 4000);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto mt-10 text-center text-sm text-gray-600">
        Carregando usuário...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-6 mb-10">
      <h1 className="text-xl font-semibold text-[#1f3c88] mb-1">
        Meu Perfil
      </h1>
      <p className="text-[11px] text-gray-600 mb-4">
        Visualize e atualize seus dados pessoais. Cada ministro gerencia apenas
        as informações da sua própria conta.
      </p>

      {loading ? (
        <div className="text-[11px] text-gray-600">
          Carregando informações...
        </div>
      ) : (
        <>
          {profileError && (
            <div className="mb-3 text-[10px] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
              {profileError}
            </div>
          )}

          {/* Bloco: dados da conta */}
          {minister && (
            <>
              <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">
                  Dados da conta
                </h2>

                <div className="grid gap-3 text-[11px]">
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-1">
                      E-mail de acesso
                    </label>
                    <div className="px-3 py-2 border rounded-lg bg-gray-50 text-gray-800">
                      {user.email || "—"}
                    </div>
                    <p className="mt-1 text-[9px] text-gray-500">
                      O e-mail é gerenciado pela coordenação. Para alteração,
                      entre em contato com um administrador.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600">
                      Tipo de acesso:
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[#E6EEF9] text-[#1f3c88]">
                      {minister.is_admin ? "Administrador" : "Ministro"}
                    </span>
                  </div>
                </div>
              </section>

              {/* Bloco: dados pessoais */}
              <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">
                  Informações pessoais
                </h2>

                <form
                  onSubmit={handleSaveProfile}
                  className="space-y-3 text-[11px]"
                >
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-1">
                      Nome completo
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-[11px]"
                      placeholder="Digite seu nome"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-600 mb-1">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-[11px]"
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  {profileMessage && (
                    <div className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded">
                      {profileMessage}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="px-4 py-1.5 rounded-full bg-[#1f3c88] text-white text-[10px] font-semibold hover:bg-[#182f6a] disabled:opacity-60"
                    >
                      {savingProfile ? "Salvando..." : "Salvar dados"}
                    </button>
                  </div>
                </form>
              </section>

              {/* Bloco: alterar senha */}
              <section className="bg-white border border-gray-200 rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">
                  Segurança da conta
                </h2>
                <p className="text-[9px] text-gray-600 mb-3">
                  Aqui você altera sua senha de acesso. Esta ação é pessoal
                  e não pode ser realizada pelos administradores.
                </p>

                <form
                  onSubmit={handleChangePassword}
                  className="space-y-3 text-[11px]"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] text-gray-600 mb-1">
                        Nova senha
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-[11px]"
                        placeholder="Mínimo 6 caracteres"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-gray-600 mb-1">
                        Confirmar nova senha
                      </label>
                      <input
                        type="password"
                        value={passwordConfirm}
                        onChange={(e) =>
                          setPasswordConfirm(e.target.value)
                        }
                        className="w-full px-3 py-2 border rounded-lg text-[11px]"
                        placeholder="Repita a nova senha"
                      />
                    </div>
                  </div>

                  {passwordMessage && (
                    <div className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded">
                      {passwordMessage}
                    </div>
                  )}
                  {passwordError && (
                    <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded">
                      {passwordError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingPassword}
                      className="px-4 py-1.5 rounded-full border border-[#1f3c88] text-[#1f3c88] text-[10px] font-semibold hover:bg-[#E6EEF9] disabled:opacity-60"
                    >
                      {savingPassword ? "Alterando..." : "Alterar senha"}
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default PerfilPage;
