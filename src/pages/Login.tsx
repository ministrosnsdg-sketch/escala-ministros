import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type Mode = "login" | "changePassword" | "register";

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

  // troca de senha
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
      const { error: signInError } = await signIn(
        email.trim(),
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
        // MESMO COM ERRO AQUI, SEMPRE VAI PRA ESCALA
        navigate("/escala", { replace: true });
        return;
      }

      if (mins && mins[0]?.must_reset_password) {
        setPendingUserId(user.id);
        setMode("changePassword");
        setLoading(false);
        return;
      }

      // Permanecer conectado:
      if (!rememberMe) {
        window.onbeforeunload = () => {
          supabase.auth.signOut();
        };
      } else {
        window.onbeforeunload = null;
      }

      setLoading(false);
      // LOGIN BEM-SUCEDIDO → SEMPRE ESCALA
      navigate("/escala", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao tentar entrar.");
      setLoading(false);
    }
  };

  // ---------------- TROCA DE SENHA PRIMEIRO ACESSO ----------------

  const handleChangePassword = async () => {
    if (!pendingUserId) {
      setError(
        "Não foi possível identificar o usuário para troca de senha. Faça login novamente."
      );
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

      const { error: flagErr } = await supabase
        .from("ministers")
        .update({ must_reset_password: false })
        .eq("user_id", pendingUserId);

      if (flagErr) console.error(flagErr);

      setMode("login");
      setLoading(false);
      // Depois de trocar a senha, também vai direto pra Escala
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

    if (!regPassword || regPassword.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
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
            email: regEmail.trim(),
            phone: regPhone.trim() || null,
            password: regPassword,
          },
        }
      );

      if (error || (data as any)?.error) {
        console.error(error || (data as any)?.error);
        setError(
          (data as any)?.error ||
            "Não foi possível concluir o cadastro. Verifique o código e os dados."
        );
        setLoading(false);
        return;
      }

      setMode("login");
      setEmail(regEmail.trim());
      setPassword("");

      setRegCode("");
      setRegName("");
      setRegEmail("");
      setRegPhone("");
      setRegPassword("");
      setRegPassword2("");

      setError(
        "Cadastro realizado com sucesso. Agora faça login com seu e-mail e senha."
      );
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao realizar cadastro.");
      setLoading(false);
    }
  };

  // ---------------- UI HELPERS ----------------

  const renderTitle = () => {
    if (isChangeMode)
      return "Defina sua nova senha para continuar";
    if (isRegisterMode)
      return "Cadastro restrito: use o código fornecido pela coordenação";
    return "Acesso restrito à coordenação e ministros autorizados";
  };

  const submitLabel = () => {
    if (loading && isChangeMode) return "Salvando...";
    if (loading && isRegisterMode) return "Cadastrando...";
    if (loading) return "Entrando...";
    if (isChangeMode) return "Salvar nova senha";
    if (isRegisterMode) return "Cadastrar";
    return "Entrar";
  };

  // ---------------- RENDER ----------------

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-md p-6 w-full max-w-sm border border-[#D6E6F7]">
        <img
          src="/brasao.png"
          alt="Brasão da Paróquia"
          className="mx-auto mb-3 h-[4cm] w-auto"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (img.src.indexOf("brasao.png") !== -1) {
              img.src = "/brasão.png";
            }
          }}
        />

        <h1 className="text-center text-[#4A6FA5] font-semibold text-[10px] mb-1">
          ESCALA DE MINISTROS EXTRAORDINÁRIOS DA DISTRIBUIÇÃO DA EUCARISTIA
        </h1>
        <h2 className="text-center text-gray-700 text-[9px] mb-4">
          {renderTitle()}
        </h2>

        {!isChangeMode && (
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
          <div className="mb-3 text-[10px] text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "login" && !isChangeMode && (
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
                  autoComplete="email"
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
                  autoComplete="current-password"
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <label className="flex items-center gap-1 text-[9px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Permanecer conectado neste dispositivo
                </label>
              </div>
            </>
          )}

          {isChangeMode && (
            <>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Nova senha
                </label>
                <input
                  type="password"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Repita a nova senha
                </label>
                <input
                  type="password"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          {isRegisterMode && !isChangeMode && (
            <>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Código de acesso *
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regCode}
                  onChange={(e) => setRegCode(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Nome completo *
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  E-mail *
                </label>
                <input
                  type="email"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Telefone (opcional)
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Senha *
                </label>
                <input
                  type="password"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Repita a senha *
                </label>
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
            className="w-full mt-1 py-1.5 text-sm rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F] disabled:opacity-60"
          >
            {submitLabel()}
          </button>
        </form>
      </div>
    </div>
  );
}
