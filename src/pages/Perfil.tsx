// src/pages/Perfil.tsx
import React, { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import {
  isBiometricAvailable,
  getBiometricLabel,
  isBiometricEnabled,
  setBiometricEnabled,
  clearBiometricCredentials,
} from "../lib/biometricHelpers";
import {
  isPushSupported,
  getPushPermission,
  requestPushPermission,
  registerPushToken,
} from "../lib/pushHelpers";

type MinisterProfile = {
  id: string;
  name: string | null;
  phone?: string | null;
  is_admin?: boolean | null;
  birth_date?: string | null;
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
  const [birthDate, setBirthDate] = useState("");

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

  // notificações push
  const [pushPermission, setPushPermission] = React.useState<string>("");
  const [pushLoading, setPushLoading] = React.useState(false);
  const [pushMessage, setPushMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isPushSupported()) {
      setPushPermission(getPushPermission());
    } else {
      setPushPermission("unsupported");
    }
  }, []);

  async function handleActivatePush() {
    setPushLoading(true);
    setPushMessage(null);
    // Limpa o flag "já perguntei" para forçar o pedido de permissão
    localStorage.removeItem("push_permission_asked");
    const ok = await requestPushPermission();
    if (ok) {
      setPushPermission("granted");
      setPushMessage("✅ Notificações ativadas neste dispositivo!");
    } else {
      setPushPermission(getPushPermission());
      setPushMessage("Permissão negada. Vá em Configurações do celular → Chrome → Notificações e ative.");
    }
    setPushLoading(false);
    setTimeout(() => setPushMessage(null), 5000);
  }

  async function handleRefreshPush() {
    setPushLoading(true);
    const ok = await registerPushToken();
    setPushMessage(ok ? "✅ Token atualizado com sucesso!" : "Erro ao atualizar token.");
    setPushLoading(false);
    setTimeout(() => setPushMessage(null), 3000);
  }

  // modal de data de aniversário obrigatória
  const [showBirthdateModal, setShowBirthdateModal] = useState(false);
  const [modalBirthDate, setModalBirthDate] = useState("");
  const [savingModalBirthdate, setSavingModalBirthdate] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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
          .select("id, name, phone, is_admin, birth_date")
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
            .select("id, name, phone, is_admin, birth_date")
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
        setBirthDate(ministerData.birth_date || "");

        // Verifica se precisa mostrar o modal de data de aniversário
        if (!ministerData.birth_date) {
          setShowBirthdateModal(true);
        }
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
        birth_date: birthDate || null,
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
                birth_date: updates.birth_date ?? prev.birth_date,
              }
            : prev
        );
      }
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMessage(null), 4000);
    }
  }

  // Salvar data de aniversário via modal
  async function handleSaveModalBirthdate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !minister) return;

    setModalError(null);

    if (!modalBirthDate) {
      setModalError("Por favor, preencha sua data de aniversário.");
      return;
    }

    setSavingModalBirthdate(true);

    try {
      const { error } = await supabase
        .from("ministers")
        .update({ birth_date: modalBirthDate })
        .eq("id", minister.id);

      if (error) {
        console.error("Erro ao salvar data de aniversário:", error);
        setModalError("Erro ao salvar. Tente novamente.");
      } else {
        setBirthDate(modalBirthDate);
        setMinister((prev) =>
          prev
            ? {
                ...prev,
                birth_date: modalBirthDate,
              }
            : prev
        );
        setShowBirthdateModal(false);
      }
    } finally {
      setSavingModalBirthdate(false);
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

  const initials = name.split(" ").slice(0,2).map(w=>w[0]||"").join("").toUpperCase();

  return (
    <div className="max-w-lg mx-auto">

      {/* Modal obrigatório para data de aniversário */}
      {showBirthdateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            <div className="bg-gradient-to-r from-[#1E3A6E] to-[#4A6FA5] px-5 py-4">
              <h2 className="text-white font-bold text-base">Complete seu cadastro</h2>
              <p className="text-blue-200 text-xs mt-0.5">Precisamos de mais um dado seu</p>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-4">
                Informe sua data de aniversário para que a coordenação possa parabenizá-lo!
              </p>
              <form onSubmit={handleSaveModalBirthdate} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Data de aniversário *</label>
                  <input type="date" value={modalBirthDate} onChange={(e) => setModalBirthDate(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none" required />
                </div>
                {modalError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{modalError}</div>}
                <button type="submit" disabled={savingModalBirthdate}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] text-white text-sm font-bold disabled:opacity-60 shadow-md shadow-blue-100">
                  {savingModalBirthdate ? "Salvando..." : "Salvar e continuar"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      ) : (
        <>
          {profileError && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border-2 border-red-200 px-3 py-2 rounded-xl">{profileError}</div>
          )}

          {minister && (
            <div className="space-y-4">

              {/* Card de identidade */}
              <div className="bg-gradient-to-br from-[#1E3A6E] to-[#4A6FA5] rounded-2xl p-5 text-white">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
                    {initials || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold truncate">{name || "Ministro"}</h1>
                    <p className="text-blue-200 text-sm truncate">{user.email}</p>
                    <span className="inline-block mt-1.5 px-2.5 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
                      {minister.is_admin ? "⭐ Administrador" : "🙏 Ministro"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Informações pessoais */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h2 className="text-sm font-bold text-[#1E3A6E]">Informações pessoais</h2>
                </div>
                <form onSubmit={handleSaveProfile} className="p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Nome completo</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none"
                      placeholder="Seu nome completo" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Data de aniversário</label>
                    <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Telefone / WhatsApp</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none"
                      placeholder="(00) 00000-0000" />
                  </div>
                  {profileMessage && (
                    <div className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl">{profileMessage}</div>
                  )}
                  <button type="submit" disabled={savingProfile}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] text-white text-sm font-bold disabled:opacity-60 shadow-sm">
                    {savingProfile ? "Salvando..." : "Salvar dados"}
                  </button>
                </form>
              </div>

              {/* E-mail (só leitura) */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h2 className="text-sm font-bold text-[#1E3A6E]">Acesso</h2>
                </div>
                <div className="p-4">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">E-mail de acesso</label>
                  <div className="border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-600">{user.email}</div>
                  <p className="text-xs text-gray-400 mt-1.5">Para alterar o e-mail, fale com a coordenação.</p>
                </div>
              </div>

              {/* Segurança */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* NOTIFICAÇÕES PUSH */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h2 className="text-sm font-bold text-[#1E3A6E]">🔔 Notificações</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Receba avisos de escalas, trocas e aniversários</p>
                </div>
                <div className="p-4 space-y-3">
                  {pushPermission === "unsupported" ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <p className="text-sm text-gray-600">⚠️ Seu navegador não suporta notificações push.</p>
                      <p className="text-xs text-gray-400 mt-1">Use o Chrome no Android para receber notificações.</p>
                    </div>
                  ) : pushPermission === "granted" ? (
                    <div className="space-y-3">
                      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
                        <span className="text-xl">✅</span>
                        <div>
                          <p className="text-sm font-semibold text-green-800">Notificações ativas</p>
                          <p className="text-xs text-green-600">Você receberá avisos neste dispositivo.</p>
                        </div>
                      </div>
                      <button
                        onClick={handleRefreshPush}
                        disabled={pushLoading}
                        className="w-full py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        {pushLoading ? "Atualizando..." : "🔄 Atualizar registro deste dispositivo"}
                      </button>
                    </div>
                  ) : pushPermission === "denied" ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <p className="text-sm font-semibold text-red-800">🚫 Notificações bloqueadas</p>
                      <p className="text-xs text-red-600 mt-1">
                        Para ativar: no Chrome, toque nos 3 pontinhos → Configurações do site → Notificações → Permitir
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <p className="text-sm font-semibold text-amber-800">Notificações desativadas</p>
                        <p className="text-xs text-amber-600 mt-0.5">Ative para receber avisos importantes da paróquia.</p>
                      </div>
                      <button
                        onClick={handleActivatePush}
                        disabled={pushLoading}
                        className="w-full py-3 rounded-xl bg-[#4A6FA5] text-white text-sm font-bold hover:bg-[#3d5d8a] disabled:opacity-50 transition-colors"
                      >
                        {pushLoading ? "Aguarde..." : "🔔 Ativar notificações neste dispositivo"}
                      </button>
                    </div>
                  )}
                  {pushMessage && (
                    <div className={`text-sm px-3 py-2 rounded-xl ${
                      pushMessage.startsWith("✅")
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-600 border border-red-200"
                    }`}>
                      {pushMessage}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h2 className="text-sm font-bold text-[#1E3A6E]">Segurança</h2>
                </div>

                {/* Biometria toggle */}
                {isBiometricAvailable() && (
                  <BiometricToggle onMessage={(msg) => { setProfileMessage(msg); setTimeout(() => setProfileMessage(null), 4000); }} />
                )}

                <form onSubmit={handleChangePassword} className="p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Nova senha</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none"
                      placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Confirmar senha</label>
                    <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none"
                      placeholder="Repita a nova senha" />
                  </div>
                  {passwordMessage && <div className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl">{passwordMessage}</div>}
                  {passwordError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{passwordError}</div>}
                  <button type="submit" disabled={savingPassword}
                    className="w-full py-3 rounded-xl border-2 border-[#4A6FA5] text-[#4A6FA5] text-sm font-bold hover:bg-[#EEF4FF] disabled:opacity-60 transition-colors">
                    {savingPassword ? "Alterando..." : "Alterar senha"}
                  </button>
                </form>
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
};

// Componente isolado com state próprio para reatividade do toggle
function BiometricToggle({ onMessage }: { onMessage: (msg: string) => void }) {
  const [enabled, setEnabled] = useState(isBiometricEnabled());
  const label = getBiometricLabel();

  const handleToggle = () => {
    if (enabled) {
      clearBiometricCredentials();
      setBiometricEnabled(false);
      setEnabled(false);
      onMessage(`${label} desativado. Faça login novamente com e-mail e senha para reativar.`);
    } else {
      setBiometricEnabled(true);
      setEnabled(true);
      onMessage(`${label} será ativado no próximo login com e-mail e senha.`);
    }
  };

  return (
    <div className="px-4 py-4 border-b border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔐</span>
            <div>
              <p className="text-sm font-semibold text-gray-800">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {enabled
                  ? "Ativado — entre no sistema usando biometria"
                  : "Desativado — entre sempre com e-mail e senha"}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={handleToggle}
          className={`ml-3 relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
            enabled ? "bg-[#4A6FA5]" : "bg-gray-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export default PerfilPage;
