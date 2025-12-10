import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type Mode = "login" | "changePassword" | "register" | "forgotPassword";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("login");

  // login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // estados gerais
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 🔵 RESET DE SENHA (TELA ESPECÍFICA)
  const [resetEmail, setResetEmail] = useState("");

  // troca de senha obrigatória
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  // cadastro com código
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");

  const isChangeMode = mode === "changePassword";
  const isRegisterMode = mode === "register";
  const isForgot = mode === "forgotPassword";

  useEffect(() => {
    return () => {
      window.onbeforeunload = null;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isChangeMode) {
      await handleChangePassword();
      return;
    }

    if (isRegisterMode) {
      await handleRegister();
      return;
    }

    if (isForgot) {
      await handleResetPassword();
      return;
    }

    await handleLogin();
  };

  // ---------------- LOGIN NORMAL ----------------

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Informe e-mail e senha.");
      return;
    }

    setLoading(true);

    try {
      // força e-mail minúsculo ao logar
const normalizedEmail = email.trim().toLowerCase();

const { error: signInError } = await signIn(
  normalizedEmail,
  password.trim()
);


      if (signInError) {
        console.error(signInError);
        setError("E-mail ou senha inválidos.");
        setLoading(false);
        return;
      }

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        console.error(userErr);
        setError("Não foi possível obter os dados do usuário.");
        setLoading(false);
        return;
      }

      // Verifica se precisa trocar senha (ministro criado pelo admin)
      const { data: mins, error: minsErr } = await supabase
        .from("ministers")
        .select("id, must_reset_password")
        .eq("user_id", user.id)
        .limit(1);

      if (minsErr) {
        console.error(minsErr);
        setLoading(false);
        navigate("/escala", { replace: true });
        return;
      }

      if (mins && mins[0]?.must_reset_password) {
        setPendingUserId(user.id);
        setMode("changePassword");
        setLoading(false);
        return;
      }

      if (!rememberMe) {
        window.onbeforeunload = () => supabase.auth.signOut();
      } else {
        window.onbeforeunload = null;
      }

      setLoading(false);
      navigate("/escala", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao tentar entrar.");
      setLoading(false);
    }
  };

  // ---------------- RESET DE SENHA (TELA SEPARADA) ----------------

  const handleResetPassword = async () => {
    if (!resetEmail.trim()) {
      setError("Informe o e-mail para redefinir a senha.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        "reset-password",
        {
          method: "POST",
          body: { email: resetEmail.trim() },
        }
      );

      if (error || (data as any)?.error) {
        setError((data as any)?.error || "Não foi possível redefinir a senha.");
        setLoading(false);
        return;
      }

      setError("Senha redefinida com sucesso! Use a senha: 123456 para entrar.");
      setResetEmail("");
      setLoading(false);
      setMode("login");
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao redefinir a senha.");
      setLoading(false);
    }
  };

  // ---------------- TROCA DE SENHA OBRIGATÓRIA ----------------

  const handleChangePassword = async () => {
    if (!pendingUserId) {
      setError("Não foi possível identificar o usuário. Faça login novamente.");
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updErr) {
        console.error(updErr);
        setError("Erro ao atualizar a senha.");
        setLoading(false);
        return;
      }

      await supabase
        .from("ministers")
        .update({ must_reset_password: false })
        .eq("user_id", pendingUserId);

      setMode("login");
      setLoading(false);
      navigate("/escala", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao trocar a senha.");
      setLoading(false);
    }
  };

  // ---------------- CADASTRO COM CÓDIGO ----------------

  const handleRegister = async () => {
  if (!regCode.trim() || !regName.trim() || !regEmail.trim()) {
    setError("Preencha código, nome e e-mail.");
    return;
  }

  // cria variável auxiliar para normalizar email
  const normalizedEmail = regEmail.trim().toLowerCase();

  if (!regPassword || regPassword.length < 6) {
    setError("A senha deve ter pelo menos 6 caracteres.");
    return;
  }

  // impede cadastro com e-mail já existente
  const { data: existing } = await supabase
    .from("ministers")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existing) {
    setError("Este e-mail já está cadastrado no sistema.");
    setLoading(false);
    return;
  }

  if (regPassword !== regPassword2) {
    setError("As senhas não conferem.");
    return;
  }

  setLoading(true);
  setError(null);

  try {
    const { data, error } = await supabase.functions.invoke(
      "register-with-code",
      {
        body: {
          code: regCode.trim(),
          name: regName.trim(),
          email: normalizedEmail, // já em lowercase
          phone: regPhone.trim() || null,
          password: regPassword,
        },
      }
    );

    if (error || (data as any)?.error) {
      console.error(error || (data as any)?.error);
      setError(
        (data as any)?.error || "Não foi possível concluir o cadastro."
      );
      setLoading(false);
      return;
    }

    // coloca o e-mail normalizado no campo de login após cadastro
    setMode("login");
    setEmail(normalizedEmail);
    setPassword("");

    setRegCode("");
    setRegName("");
    setRegEmail("");
    setRegPhone("");
    setRegPassword("");
    setRegPassword2("");

    setError("Cadastro realizado com sucesso!");
    setLoading(false);
  } catch (err) {
    console.error(err);
    setError("Erro inesperado ao realizar cadastro.");
    setLoading(false);
  }
};

  // ---------------- UI HELPERS ----------------

  const renderTitle = () => {
    if (isChangeMode) return "Defina sua nova senha";
    if (isRegisterMode) return "Cadastro com código";
    if (isForgot) return "Redefinir senha";
    return "Acesso restrito";
  };

  const submitLabel = () => {
    if (loading) {
      if (isChangeMode) return "Salvando...";
      if (isRegisterMode) return "Cadastrando...";
      if (isForgot) return "Enviando...";
      return "Entrando...";
    }
    if (isChangeMode) return "Salvar nova senha";
    if (isRegisterMode) return "Cadastrar";
    if (isForgot) return "Enviar redefinição";
    return "Entrar";
  };

  const isSuccess = error?.toLowerCase().includes("sucesso");

  // ---------------- RENDER ----------------

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-md p-6 w-full max-w-sm border border-[#D6E6F7]">
        <img
          src="/brasao.png"
          alt="Brasão"
          className="mx-auto mb-3 h-[4cm] w-auto"
        />

        <h1 className="text-center text-[#4A6FA5] font-semibold text-[10px] mb-1">
          ESCALA DE MINISTROS EXTRAORDINÁRIOS DA DISTRIBUIÇÃO DA EUCARISTIA
        </h1>

        <h2 className="text-center text-gray-700 text-[9px] mb-4">
          {renderTitle()}
        </h2>

        {!isChangeMode && !isForgot && (
          <div className="flex mb-3 text-[10px] border-b border-gray-200">
            <button
              type="button"
              className={`flex-1 py-1 text-center ${
                mode === "login"
                  ? "text-[#4A6FA5] border-b-2 border-[#4A6FA5] font-semibold"
                  : "text-gray-500"
              }`}
              onClick={() => {
                setMode("login");
                setError(null);
              }}
            >
              Entrar
            </button>

            <button
              type="button"
              className={`flex-1 py-1 text-center ${
                mode === "register"
                  ? "text-[#4A6FA5] border-b-2 border-[#4A6FA5] font-semibold"
                  : "text-gray-500"
              }`}
              onClick={() => {
                setMode("register");
                setError(null);
              }}
            >
              Cadastro com código
            </button>
          </div>
        )}

        {error && (
          <div
            className={`mb-3 text-[10px] px-2 py-1.5 rounded border ${
              isSuccess
                ? "text-green-700 bg-green-50 border-green-200"
                : "text-red-600 bg-red-50 border-red-200"
            }`}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* LOGIN */}
          {mode === "login" && !isChangeMode && !isRegisterMode && (
            <>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="flex justify-between items-center">
                <label className="text-[9px] text-gray-600 flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Permanecer conectado
                </label>

                <button
                  type="button"
                  className="text-[10px] text-blue-600 underline"
                  onClick={() => {
                    setMode("forgotPassword");
                    setError(null);
                    setResetEmail(email);
                  }}
                >
                  Esqueci minha senha
                </button>
              </div>
            </>
          )}

          {/* TROCA DE SENHA */}
          {isChangeMode && (
            <>
              <div>
                <label className="block text-[10px]">Nova senha</label>
                <input
                  type="password"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px]">Repita a nova senha</label>
                <input
                  type="password"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                />
              </div>
            </>
          )}

          {/* ESQUECI MINHA SENHA */}
          {isForgot && (
            <>
              <div>
                <label className="block text-[10px]">E-mail cadastrado</label>
                <input
                  type="email"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="text-[10px] text-blue-600 underline"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                Voltar ao login
              </button>
            </>
          )}

          {/* CADASTRO COM CÓDIGO */}
          {isRegisterMode && !isChangeMode && !isForgot && (
            <>
              <div>
                <label className="block text-[10px]">Código *</label>
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regCode}
                  onChange={(e) => setRegCode(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px]">Nome completo *</label>
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px]">E-mail *</label>
                <input
                  type="email"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px]">Telefone (opcional)</label>
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px]">Senha *</label>
                <input
                  type="password"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px]">Repita a senha *</label>
                <input
                  type="password"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regPassword2}
                  onChange={(e) => setRegPassword2(e.target.value)}
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1 py-1.5 text-sm rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F]"
          >
            {submitLabel()}
          </button>
        </form>
      </div>
    </div>
  );
}
