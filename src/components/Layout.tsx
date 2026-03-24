import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { isPWA } from "../lib/biometricHelpers";
import { isPushSupported, getPushPermission, wasPushAsked, requestPushPermission, refreshPushTokenIfGranted } from "../lib/pushHelpers";

interface MenuItem {
  path: string;
  label: string;
  icon: string;
}

const COMMON_MENU: MenuItem[] = [
  { path: "/escala", label: "Escala", icon: "📅" },
  { path: "/disponibilidade", label: "Disponibilidade", icon: "✅" },
  { path: "/troca", label: "Troca", icon: "🔄" },
];

const ADMIN_EXTRA_MENU: MenuItem[] = [
  { path: "/ministros", label: "Ministros", icon: "👥" },
  { path: "/horarios", label: "Horários", icon: "🕐" },
  { path: "/extras", label: "Missas Solenes", icon: "⛪" },
  { path: "/relatorios", label: "Administração", icon: "📊" },
  { path: "/exportar", label: "Exportar", icon: "📤" },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Banners
  const [showBirthBanner, setShowBirthBanner] = useState(false);
  const [pendingSwaps, setPendingSwaps] = useState(0);
  const [showMondayReminder, setShowMondayReminder] = useState(false);
  const [birthdayList, setBirthdayList] = useState<{name: string; day: number}[]>([]);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [activeNotifications, setActiveNotifications] = useState<{id: string; title: string; message: string}[]>([]);
  const [dismissedNotifs, setDismissedNotifs] = useState<Set<string>>(new Set());
  const [showPushBanner, setShowPushBanner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) { setIsAdmin(false); setDisplayName(""); setShowBirthBanner(false); setPendingSwaps(0); }
        return;
      }
      const { data, error } = await supabase
        .from("ministers")
        .select("id, name, is_admin, birth_date")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setIsAdmin(false);
        setDisplayName(user.email || "Usuário");
      } else {
        setIsAdmin(!!data?.is_admin);
        setDisplayName(data?.name || user.email || "Usuário");
        // Se não tem data de aniversário, redirecionar direto para o perfil
        if (data && !data.birth_date) {
          setShowBirthBanner(true);
          // Redirecionar para o perfil se não está lá ainda
          if (window.location.pathname !== "/perfil") {
            navigate("/perfil", { replace: true });
          }
        }
        // Verificar trocas pendentes
        if (data?.id) {
          const { count } = await supabase
            .from("swap_requests")
            .select("id", { count: "exact", head: true })
            .neq("requester_id", data.id)
            .eq("status", "pending")
            .gte("expires_at", new Date().toISOString());
          if (!cancelled) setPendingSwaps(count || 0);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Notificações automáticas: push, segunda-feira, aniversariantes, avisos
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const now = new Date();

      // Push: mostrar banner em qualquer navegador que suporte (não só PWA)
      // Se já concedeu, atualiza o token silenciosamente
      if (isPushSupported()) {
        const perm = getPushPermission();
        if (perm === "granted") {
          // Token já concedido — re-registra para manter atualizado
          refreshPushTokenIfGranted();
        } else if (perm === "default" && !wasPushAsked()) {
          // Ainda não perguntamos — mostrar banner
          if (!cancelled) setShowPushBanner(true);
        }
      }

      // Segunda-feira: lembrar de preencher escala
      if (now.getDay() === 1) {
        const dismissedMonday = sessionStorage.getItem("monday_dismissed");
        if (!dismissedMonday || dismissedMonday !== now.toISOString().slice(0, 10)) {
          if (!cancelled) setShowMondayReminder(true);
        }
      }

      // Aniversariantes do mês (com dia)
      const currentMonth = now.getMonth() + 1;
      const { data: bdays } = await supabase
        .from("ministers")
        .select("name, birth_date")
        .not("birth_date", "is", null);

      if (!cancelled && bdays) {
        const list = bdays
          .filter((m: any) => {
            if (!m.birth_date) return false;
            const parts = m.birth_date.split("-");
            return parseInt(parts[1]) === currentMonth;
          })
          .map((m: any) => {
            const day = parseInt(m.birth_date.split("-")[2]);
            return { name: m.name, day };
          })
          .sort((a: any, b: any) => a.day - b.day);

        setBirthdayList(list);

        // Mostrar modal só uma vez por sessão
        if (list.length > 0) {
          const dismissed = sessionStorage.getItem("birthday_modal_dismissed");
          if (!dismissed) {
            if (!cancelled) setShowBirthdayModal(true);
          }
        }
      }

      // 🔕 Notificações manuais do admin — temporariamente desativadas
      // Para reativar: descomentar o bloco abaixo
      // try {
      //   const { data: notifs } = await supabase
      //     .from("admin_notifications")
      //     .select("id, title, message, scheduled_at, target")
      //     .eq("sent", true)
      //     .order("created_at", { ascending: false })
      //     .limit(5);
      //   if (!cancelled && notifs) {
      //     const active = notifs.filter((n: any) => {
      //       if (n.scheduled_at && new Date(n.scheduled_at) > now) return false;
      //       return true;
      //     });
      //     setActiveNotifications(active);
      //   }
      // } catch {}
    })();

    return () => { cancelled = true; };
  }, [user]);

  const FULL_MENU = useMemo(
    () => isAdmin ? [...COMMON_MENU, ...ADMIN_EXTRA_MENU] : COMMON_MENU,
    [isAdmin]
  );

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#F0F4FA] flex flex-col">

      {/* HEADER */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">

          {/* Hamburguer — somente admin */}
          {isAdmin ? (
            <button
              className="flex items-center justify-center w-10 h-10 rounded-xl text-[#4A6FA5] hover:bg-blue-50 transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          ) : (
            <div className="w-10 md:hidden" />
          )}

          {/* Título */}
          <div className="flex-1 min-w-0">
            <h1 className="text-base md:text-xl font-bold text-[#1E3A6E] leading-tight truncate text-center md:text-left">
              Escala de Ministros
            </h1>
            <p className="hidden md:block text-xs text-gray-400 mt-0.5">
              Paróquia Nossa Senhora das Graças
            </p>
          </div>

          {/* Direito */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm text-gray-700">
                Olá, <span className="font-semibold text-[#4A6FA5]">{displayName}</span>
              </span>
              <div className="flex items-center gap-3 mt-0.5">
                <Link to="/perfil" className="text-xs text-[#4A6FA5] hover:underline">
                  Meu Perfil
                </Link>
                <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
                  Sair
                </button>
              </div>
            </div>

            {/* Avatar */}
            <Link
              to="/perfil"
              className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[#4A6FA5] to-[#2756A3] text-white font-bold text-sm shadow-sm flex-shrink-0"
            >
              {initials || "?"}
            </Link>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:block border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-4 flex gap-1">
            {FULL_MENU.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive(item.path)
                    ? "border-[#4A6FA5] text-[#4A6FA5]"
                    : "border-transparent text-gray-500 hover:text-[#4A6FA5] hover:border-gray-200"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      {/* DRAWER — admin mobile */}
      {isAdmin && mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 md:hidden flex flex-col">
            <div className="p-5 bg-gradient-to-br from-[#1E3A6E] to-[#4A6FA5]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg">
                  {initials || "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{displayName}</p>
                  <p className="text-blue-200 text-xs mt-0.5 truncate">{user?.email}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 bg-white/20 rounded-full text-white text-xs font-medium">
                    Administrador
                  </span>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {FULL_MENU.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive(item.path)
                      ? "bg-[#EEF4FF] text-[#4A6FA5] font-semibold"
                      : "text-gray-600 hover:bg-gray-50 hover:text-[#4A6FA5]"
                  }`}
                >
                  <span className="text-xl w-7 text-center">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {isActive(item.path) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4A6FA5]" />
                  )}
                </Link>
              ))}
            </nav>

            <div className="p-3 border-t border-gray-100">
              <Link
                to="/perfil"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 mb-1"
              >
                <span className="text-xl w-7 text-center">👤</span>
                <span>Meu Perfil</span>
              </Link>
              <button
                onClick={() => { setMobileOpen(false); signOut(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
              >
                <span className="text-xl w-7 text-center">🚪</span>
                <span>Sair</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* BANNERS / TOASTS */}
      {showPushBanner && (
        <div className="max-w-7xl mx-auto px-3 pt-3">
          <div className="bg-[#EEF4FF] border border-[#D6E6F7] rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg flex-shrink-0">🔔</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1E3A6E]">Ativar notificações?</p>
              <p className="text-xs text-gray-600">Receba avisos de trocas, escalas e aniversários.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => { setShowPushBanner(false); localStorage.setItem("push_permission_asked", "true"); }}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
              >Não</button>
              <button
                onClick={async () => { await requestPushPermission(); setShowPushBanner(false); }}
                className="px-3 py-1.5 text-xs font-semibold bg-[#4A6FA5] text-white rounded-lg"
              >Ativar</button>
            </div>
          </div>
        </div>
      )}

      {showBirthBanner && location.pathname !== "/perfil" && (
        <div className="max-w-7xl mx-auto px-3 pt-3">
          <div
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-amber-100 transition-colors"
            onClick={() => { navigate("/perfil"); setShowBirthBanner(false); }}
          >
            <span className="text-lg flex-shrink-0">📋</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Complete seu cadastro</p>
              <p className="text-xs text-amber-600">Atualize seu perfil e preencha sua data de aniversário.</p>
            </div>
            <span className="text-amber-400 text-sm flex-shrink-0">Ir →</span>
          </div>
        </div>
      )}

      {pendingSwaps > 0 && location.pathname !== "/troca" && (
        <div className="max-w-7xl mx-auto px-3 pt-2">
          <div
            className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-blue-100 transition-colors"
            onClick={() => navigate("/troca")}
          >
            <span className="text-lg flex-shrink-0">🔄</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-800">
                {pendingSwaps} {pendingSwaps === 1 ? "troca pendente" : "trocas pendentes"}
              </p>
              <p className="text-xs text-blue-600">Um ministro precisa de alguém para substituí-lo.</p>
            </div>
            <span className="text-blue-400 text-sm flex-shrink-0">Ver →</span>
          </div>
        </div>
      )}

      {showMondayReminder && location.pathname !== "/disponibilidade" && (
        <div className="max-w-7xl mx-auto px-3 pt-2">
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg flex-shrink-0">📅</span>
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => { navigate("/disponibilidade"); setShowMondayReminder(false); sessionStorage.setItem("monday_dismissed", new Date().toISOString().slice(0, 10)); }}
            >
              <p className="text-sm font-semibold text-green-800">Preencha sua disponibilidade</p>
              <p className="text-xs text-green-600">Não esqueça de marcar seus horários para o próximo mês.</p>
            </div>
            <button
              onClick={() => { setShowMondayReminder(false); sessionStorage.setItem("monday_dismissed", new Date().toISOString().slice(0, 10)); }}
              className="text-green-400 hover:text-green-600 text-sm flex-shrink-0"
            >✕</button>
          </div>
        </div>
      )}

      {/* MODAL ANIVERSARIANTES DO MÊS */}
      {showBirthdayModal && birthdayList.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full overflow-hidden">
            <div className="bg-gradient-to-r from-pink-500 to-pink-400 px-5 py-4 text-center">
              <p className="text-3xl mb-1">🎂</p>
              <h2 className="text-white font-bold text-base">Aniversariantes do Mês</h2>
              <p className="text-pink-100 text-xs mt-0.5">
                {new Date().toLocaleString("pt-BR", { month: "long" }).replace(/^\w/, c => c.toUpperCase())} de {new Date().getFullYear()}
              </p>
            </div>
            <div className="p-4 max-h-[50vh] overflow-y-auto">
              <div className="space-y-2">
                {birthdayList.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-pink-50">
                    <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-pink-600">
                        {String(b.day).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{b.name}</p>
                      <p className="text-xs text-pink-500">Dia {b.day}</p>
                    </div>
                    <span className="text-lg flex-shrink-0">🎉</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 text-center mt-3 italic">
                Que Deus abençoe nossos aniversariantes!
              </p>
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => { setShowBirthdayModal(false); sessionStorage.setItem("birthday_modal_dismissed", "true"); }}
                className="w-full py-2.5 rounded-xl bg-pink-500 text-white text-sm font-semibold hover:bg-pink-600 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {activeNotifications.filter(n => !dismissedNotifs.has(n.id)).slice(0, 2).map(n => (
        <div key={n.id} className="max-w-7xl mx-auto px-3 pt-2">
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg flex-shrink-0">📢</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{n.title}</p>
              <p className="text-xs text-gray-600 line-clamp-1">{n.message}</p>
            </div>
            <button
              onClick={() => setDismissedNotifs(prev => new Set([...prev, n.id]))}
              className="text-gray-300 hover:text-gray-500 text-sm flex-shrink-0"
            >✕</button>
          </div>
        </div>
      ))}

      {/* CONTEÚDO */}
      <main className={`flex-1 w-full max-w-7xl mx-auto p-3 md:p-6 lg:p-8 ${!isAdmin ? "pb-24 md:pb-8" : ""}`}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 min-h-[calc(100vh-12rem)]">
          {children}
        </div>
      </main>

      {/* BARRA INFERIOR — usuários comuns, apenas mobile */}
      {!isAdmin && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-gradient-to-r from-[#1E3A6E] to-[#4A6FA5] border-t border-[#2756A3] shadow-[0_-4px_16px_rgba(0,0,0,0.15)]">
          <div className="flex h-16">
            {[
              { path: "/escala", icon: "📅", label: "Escala" },
              { path: "/disponibilidade", icon: "✅", label: "Disponib." },
              { path: "/troca", icon: "🔄", label: "Troca" },
              { path: "/perfil", label: "Perfil", icon: "" },
              { path: "__logout__", icon: "🚪", label: "Sair" },
            ].map((item) =>
              item.path === "__logout__" ? (
                <button
                  key={item.path}
                  onClick={signOut}
                  className="flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors"
                >
                  <span className="text-xl leading-none">🚪</span>
                  <span className="text-[10px] font-medium text-red-300">Sair</span>
                </button>
              ) : item.path === "/perfil" ? (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isActive(item.path)
                      ? "bg-white text-[#4A6FA5] shadow-md scale-110"
                      : "bg-white/20 text-white"
                  }`}>
                    {initials || "?"}
                  </div>
                  <span className={`text-[10px] font-medium ${isActive(item.path) ? "text-white font-bold" : "text-blue-200"}`}>
                    {item.label}
                  </span>
                  {isActive(item.path) && (
                    <span className="absolute top-0 inset-x-1/4 h-0.5 bg-white rounded-b-full" />
                  )}
                </Link>
              ) : (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors`}
                >
                  <span className={`text-2xl leading-none transition-transform ${isActive(item.path) ? "scale-110" : ""}`}>
                    {item.icon}
                  </span>
                  <span className={`text-[10px] font-medium ${isActive(item.path) ? "text-white font-bold" : "text-blue-200"}`}>
                    {item.label}
                  </span>
                  {isActive(item.path) && (
                    <span className="absolute top-0 inset-x-1/4 h-0.5 bg-white rounded-b-full" />
                  )}
                </Link>
              )
            )}
          </div>
        </nav>
      )}

      {/* Footer desktop */}
      <footer className="hidden md:block bg-white border-t border-gray-100 py-4">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-gray-400">
          © 2025 Paróquia Nossa Senhora das Graças · Sistema de Escala de Ministros · v3.0
        </div>
      </footer>
    </div>
  );
}

export default Layout;
