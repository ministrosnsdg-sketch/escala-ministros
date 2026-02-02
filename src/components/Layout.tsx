import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

interface MenuItem {
  path: string;
  label: string;
  icon?: string;
}

const COMMON_MENU: MenuItem[] = [
  { path: "/escala", label: "Escala", icon: "📅" },
  { path: "/disponibilidade", label: "Disponibilidade", icon: "✓" },
];

const ADMIN_EXTRA_MENU: MenuItem[] = [
  { path: "/ministros", label: "Ministros", icon: "👥" },
  { path: "/horarios", label: "Horários de Missas", icon: "🕐" },
  { path: "/extras", label: "Missas Solenes", icon: "⛪" },
  { path: "/relatorios", label: "Administração", icon: "📊" },
  { path: "/exportar", label: "Exportar", icon: "📤" },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();

  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user) {
        if (!cancelled) {
          setIsAdmin(false);
          setDisplayName("");
        }
        return;
      }

      const { data, error } = await supabase
        .from("ministers")
        .select("name, is_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error(error);
        setIsAdmin(false);
        setDisplayName(user.email || "Usuário");
      } else {
        setIsAdmin(!!data?.is_admin);
        setDisplayName(data?.name || user.email || "Usuário");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const MENU = useMemo(
    () =>
      isAdmin
        ? [
            ...COMMON_MENU,
            ...ADMIN_EXTRA_MENU.filter(
              (m) => !COMMON_MENU.some((x) => x.path === m.path)
            ),
          ]
        : COMMON_MENU,
    [isAdmin]
  );

  const linkClasses = (path: string) => {
    const active =
      location.pathname === path ||
      location.pathname.startsWith(path + "/");
    return active
      ? "bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-700"
      : "text-gray-700 hover:bg-gray-50 hover:text-blue-600 border-l-4 border-transparent";
  };

  const desktopLinkClasses = (path: string) => {
    const active =
      location.pathname === path ||
      location.pathname.startsWith(path + "/");
    return active
      ? "text-blue-700 font-semibold border-b-2 border-blue-700 pb-1"
      : "text-gray-600 hover:text-blue-600 pb-1 border-b-2 border-transparent";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top section */}
          <div className="py-4 flex items-center justify-between">
            {/* Mobile menu button */}
            <button
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Abrir menu"
              aria-expanded={mobileOpen}
              type="button"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {mobileOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>

            {/* Title */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-lg md:text-2xl font-bold text-blue-900 leading-tight">
                Escala de Ministros da Eucaristia
              </h1>
              <p className="text-sm md:text-base text-gray-600 mt-1">
                Paróquia Nossa Senhora das Graças
              </p>
            </div>

            {/* User menu */}
            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end text-right">
                <span className="text-sm text-gray-700">
                  Olá, <span className="font-semibold">{displayName}</span>
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <Link
                    to="/perfil"
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Meu Perfil
                  </Link>
                  <button
                    onClick={signOut}
                    className="text-sm text-gray-600 hover:text-gray-800 hover:underline"
                  >
                    Sair
                  </button>
                </div>
              </div>

              {/* Mobile user icon */}
              <div className="md:hidden flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:block border-t border-gray-100">
            <div className="flex gap-8 py-3">
              {MENU.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`transition-all duration-200 ${desktopLinkClasses(
                    item.path
                  )}`}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 md:hidden transform transition-transform">
            {/* Mobile menu header */}
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white text-blue-700 flex items-center justify-center font-bold text-lg">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold">{displayName}</p>
                  <p className="text-blue-100 text-sm">{user?.email}</p>
                </div>
              </div>
            </div>

            {/* Mobile menu links */}
            <nav className="p-4 space-y-2">
              <Link
                to="/perfil"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                <span className="text-xl">👤</span>
                <span>Meu Perfil</span>
              </Link>

              <div className="border-t border-gray-200 my-3"></div>

              {MENU.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${linkClasses(
                    item.path
                  )}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}

              <div className="border-t border-gray-200 my-3"></div>

              <button
                onClick={() => {
                  setMobileOpen(false);
                  signOut();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
                <span className="text-xl">🚪</span>
                <span>Sair</span>
              </button>
            </nav>
          </div>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 min-h-[calc(100vh-16rem)]">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-600">
          © 2025 Paróquia Nossa Senhora das Graças - Sistema de Escala de Ministros
        </div>
      </footer>
    </div>
  );
}

export default Layout;
