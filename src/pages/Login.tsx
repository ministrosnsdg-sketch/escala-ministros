import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase, setRememberMe, getRememberMe } from "../lib/supabaseClient";
import {
  isBiometricAvailable,
  getBiometricLabel,
  hasSavedBiometric,
  isBiometricEnabled,
  saveBiometricCredentials,
  loadBiometricCredentials,
  requestBiometricAuth,
} from "../lib/biometricHelpers";

type Mode = "login" | "changePassword" | "register" | "forgotPassword";

// Ícone de olho aberto (senha visível)
const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

// Ícone de olho fechado (senha oculta)
const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

// Componente reutilizável de input de senha com olho
function PasswordInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className={`w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:border-[#4A6FA5] focus:outline-none transition-colors ${className || ""}`}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#4A6FA5] transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMeState] = useState(getRememberMe());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  // Biometric state
  const [biometricSupported] = useState(isBiometricAvailable());
  const [biometricSaved, setBiometricSaved] = useState(hasSavedBiometric());

  // Modal pós-login para perguntar sobre biometria
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [pendingLoginCredentials, setPendingLoginCredentials] = useState<{email: string; password: string} | null>(null);

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regBirthDate, setRegBirthDate] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");

  useEffect(() => { }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "changePassword") { await handleChangePassword(); return; }
    if (mode === "register") { await handleRegister(); return; }
    if (mode === "forgotPassword") { await handleResetPassword(); return; }
    await handleLogin();
  };

  const handleLogin = async (overrideEmail?: string, overridePassword?: string) => {
    const loginEmail = overrideEmail || email.trim();
    const loginPassword = overridePassword || password.trim();
    if (!loginEmail || !loginPassword) { setError("Informe e-mail e senha."); return; }
    setLoading(true);
    try {
      const normalizedEmail = loginEmail.toLowerCase();
      const { error: signInError } = await signIn(normalizedEmail, loginPassword);
      if (signInError) { setError("E-mail ou senha inválidos."); setLoading(false); return; }
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) { setError("Não foi possível obter os dados do usuário."); setLoading(false); return; }
      const { data: mins } = await supabase.from("ministers").select("id, must_reset_password").eq("user_id", user.id).limit(1);
      if (mins && mins[0]?.must_reset_password) { setPendingUserId(user.id); setMode("changePassword"); setLoading(false); return; }
      if (!rememberMe) {
        setRememberMe(false);
      } else {
        setRememberMe(true);
      }
      setLoading(false);

      if (biometricSupported && !isBiometricEnabled() && !overrideEmail) {
        setPendingLoginCredentials({ email: normalizedEmail, password: loginPassword });
        setShowBiometricPrompt(true);
        return;
      }

      if (biometricSupported && isBiometricEnabled() && !overrideEmail) {
        saveBiometricCredentials(normalizedEmail, loginPassword);
      }

      navigate("/escala", { replace: true });
    } catch { setError("Erro inesperado ao tentar entrar."); setLoading(false); }
  };

  const handleBiometricPromptYes = () => {
    if (pendingLoginCredentials) {
      saveBiometricCredentials(pendingLoginCredentials.email, pendingLoginCredentials.password);
      setBiometricSaved(true);
    }
    setShowBiometricPrompt(false);
    setPendingLoginCredentials(null);
    navigate("/escala", { replace: true });
  };

  const handleBiometricPromptNo = () => {
    setShowBiometricPrompt(false);
    setPendingLoginCredentials(null);
    navigate("/escala", { replace: true });
  };

  const handleBiometricLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const creds = loadBiometricCredentials();
      if (!creds) {
        setError("Nenhuma credencial biométrica salva. Faça login com e-mail e senha primeiro.");
        setLoading(false);
        return;
      }
      const authenticated = await requestBiometricAuth();
      if (!authenticated) {
        setError("Autenticação biométrica cancelada ou falhou.");
        setLoading(false);
        return;
      }
      await handleLogin(creds.email, creds.password);
    } catch {
      setError("Erro ao autenticar com biometria.");
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail.trim()) { setError("Informe o e-mail para redefinir a senha."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-password", {
        body: { email: resetEmail.trim() },
      });
      if (error || (data as any)?.error) {
        setError((data as any)?.error || "Não foi possível redefinir a senha.");
        setLoading(false);
        return;
      }
      setResetEmail("");
      setLoading(false);
      setMode("login");
      setError("✅ Senha redefinida! Use a senha 123456 para entrar. Você precisará criar uma nova senha ao acessar.");
    } catch {
      setError("Erro inesperado ao redefinir a senha.");
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pendingUserId) { setError("Não foi possível identificar o usuário. Faça login novamente."); return; }
    if (!newPassword || newPassword.length < 6) { setError("A nova senha deve ter pelo menos 6 caracteres."); return; }
    if (newPassword !== confirmNewPassword) { setError("As senhas não conferem."); return; }
    setLoading(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) { setError("Erro ao atualizar a senha."); setLoading(false); return; }
      await supabase.from("ministers").update({ must_reset_password: false }).eq("user_id", pendingUserId);
      setMode("login"); setLoading(false);
      navigate("/escala", { replace: true });
    } catch { setError("Erro inesperado ao trocar a senha."); setLoading(false); }
  };

  const handleRegister = async () => {
    if (!regCode.trim() || !regName.trim() || !regEmail.trim()) { setError("Preencha código, nome e e-mail."); return; }
    if (!regBirthDate) { setError("A data de aniversário é obrigatória."); return; }
    const normalizedEmail = regEmail.trim().toLowerCase();
    if (!regPassword || regPassword.length < 6) { setError("A senha deve ter pelo menos 6 caracteres."); return; }
    const { data: existing } = await supabase.from("ministers").select("id").eq("email", normalizedEmail).maybeSingle();
    if (existing) { setError("Este e-mail já está cadastrado no sistema."); return; }
    if (regPassword !== regPassword2) { setError("As senhas não conferem."); return; }
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("register-with-code", {
        body: { code: regCode.trim(), name: regName.trim(), email: normalizedEmail, phone: regPhone.trim() || null, birth_date: regBirthDate || null, password: regPassword },
      });
      if (error || (data as any)?.error) { setError((data as any)?.error || "Não foi possível concluir o cadastro."); setLoading(false); return; }
      setMode("login"); setEmail(normalizedEmail); setPassword("");
      setRegCode(""); setRegName(""); setRegEmail(""); setRegPhone(""); setRegPassword(""); setRegPassword2("");
      setError("Cadastro realizado com sucesso!");
      setLoading(false);
    } catch { setError("Erro inesperado ao realizar cadastro."); setLoading(false); }
  };

  const isChangeMode = mode === "changePassword";
  const isRegisterMode = mode === "register";
  const isForgot = mode === "forgotPassword";
  const isSuccess = error?.toLowerCase().includes("sucesso") || error?.toLowerCase().includes("redefinida");

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EEF4FF] via-[#F8FAFF] to-[#E8F0FE] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          {/* Topo colorido */}
          <div className="bg-gradient-to-r from-[#1E3A6E] to-[#4A6FA5] px-6 py-7 text-center">
            <img src="/brasao.png" alt="Brasão" className="mx-auto h-16 w-auto mb-3 drop-shadow-md" />
            <h1 className="text-white font-bold text-base leading-snug">
              Escala de Ministros<br />da Eucaristia
            </h1>
            <p className="text-blue-200 text-xs mt-1">Paróquia Nossa Senhora das Graças</p>
          </div>

          <div className="px-6 py-5">

            {/* Abas login/cadastro */}
            {!isChangeMode && !isForgot && (
              <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
                {[
                  { key: "login", label: "Entrar" },
                  { key: "register", label: "Cadastrar" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => { setMode(tab.key as Mode); setError(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      mode === tab.key
                        ? "bg-white text-[#4A6FA5] shadow-sm font-semibold"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Título para modos especiais */}
            {(isChangeMode || isForgot) && (
              <div className="text-center mb-5">
                <h2 className="text-base font-bold text-[#1E3A6E]">
                  {isChangeMode ? "Defina sua nova senha" : "Redefinir senha"}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {isChangeMode ? "Esta é sua primeira vez. Crie uma senha segura." : "Informe o e-mail cadastrado."}
                </p>
              </div>
            )}

            {/* Mensagem de erro/sucesso */}
            {error && (
              <div className={`mb-4 px-3 py-2.5 rounded-xl text-sm border ${
                isSuccess
                  ? "text-green-700 bg-green-50 border-green-200"
                  : "text-red-600 bg-red-50 border-red-200"
              }`}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">

              {/* LOGIN */}
              {mode === "login" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">E-mail</label>
                    <input
                      type="email"
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none transition-colors"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Senha</label>
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={rememberMe} onChange={(e) => { setRememberMeState(e.target.checked); setRememberMe(e.target.checked); }} className="w-3.5 h-3.5 accent-[#4A6FA5]" />
                      Permanecer conectado
                    </label>
                    <button type="button" className="text-xs text-[#4A6FA5] hover:underline font-medium"
                      onClick={() => { setMode("forgotPassword"); setError(null); setResetEmail(email); }}>
                      Esqueci a senha
                    </button>
                  </div>
                  {biometricSaved && (
                    <button
                      type="button"
                      onClick={handleBiometricLogin}
                      disabled={loading}
                      className="w-full py-2.5 text-sm font-bold rounded-xl border-2 border-[#4A6FA5] text-[#4A6FA5] hover:bg-[#EEF4FF] disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                    >
                      <span className="text-lg">🔐</span>
                      Entrar com {getBiometricLabel()}
                    </button>
                  )}
                </>
              )}

              {/* TROCAR SENHA */}
              {isChangeMode && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nova senha</label>
                    <PasswordInput
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Confirmar senha</label>
                    <PasswordInput
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                    />
                  </div>
                </>
              )}

              {/* ESQUECI SENHA */}
              {isForgot && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">E-mail cadastrado</label>
                    <input type="email" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="seu@email.com" />
                  </div>
                  <button type="button" className="text-xs text-[#4A6FA5] hover:underline" onClick={() => { setMode("login"); setError(null); }}>
                    ← Voltar ao login
                  </button>
                </>
              )}

              {/* CADASTRO */}
              {isRegisterMode && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Código de acesso *</label>
                    <input className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none" value={regCode} onChange={(e) => setRegCode(e.target.value)} placeholder="Código fornecido pela coordenação" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nome completo *</label>
                    <input className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Seu nome completo" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">E-mail *</label>
                    <input type="email" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="seu@email.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Data de aniversário *</label>
                    <input type="date" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none" value={regBirthDate} onChange={(e) => setRegBirthDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Telefone (opcional)</label>
                    <input className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#4A6FA5] focus:outline-none" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="(00) 00000-0000" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Senha *</label>
                      <PasswordInput
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Mín. 6 car."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Confirmar *</label>
                      <PasswordInput
                        value={regPassword2}
                        onChange={(e) => setRegPassword2(e.target.value)}
                        placeholder="Repita"
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-1 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] text-white hover:from-[#1E3A6E] hover:to-[#2756A3] disabled:opacity-60 transition-all shadow-md shadow-blue-100"
              >
                {loading
                  ? "Aguarde..."
                  : isChangeMode ? "Salvar nova senha"
                  : isRegisterMode ? "Cadastrar"
                  : isForgot ? "Enviar redefinição"
                  : "Entrar"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          © 2025 Paróquia Nossa Senhora das Graças · v3.0
        </p>
      </div>

      {/* Modal pós-login: perguntar sobre biometria */}
      {showBiometricPrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-xs w-full p-5">
            <p className="text-sm text-gray-700 text-center">
              Deseja usar <span className="font-semibold">{getBiometricLabel()}</span> para acessar o sistema?
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleBiometricPromptNo}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50"
              >
                Não
              </button>
              <button
                onClick={handleBiometricPromptYes}
                className="flex-1 py-2.5 rounded-xl bg-[#4A6FA5] text-white text-sm font-semibold"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
