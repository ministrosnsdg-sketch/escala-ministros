// Layout.tsx – cabeçalho com saudação à direita e menu centralizado no desktop

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

interface MenuItem {
  path: string;
  label: string;
}

// Perfil fica fora do menu (apenas no cabeçalho)
const COMMON_MENU: MenuItem[] = [
  { path: "/escala", label: "Escala" },
  { path: "/disponibilidade", label: "Disponibilidade" },
];

const ADMIN_EXTRA_MENU: MenuItem[] = [
  { path: "/ministros", label: "Ministros" },
  { path: "/horarios", label: "Horários de Missas" },
  { path: "/extras", label: "Missas Solenes" },
  { path: "/relatorios", label: "Administração" },
  { path: "/exportar", label: "Exportar" },
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
    return (
      "text-sm transition-colors " +
      (active
        ? "text-[#4A6FA5] font-semibold"
        : "text-gray-700 hover:text-[#4A6FA5]")
    );
  };

  // cores aproximadas do layout desenhado
  const headerBg = "#E7F0FB";
  const titleBlue = "#4A6FA5";
  const textBrown = "#6A5242";

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header
        className="border-b border-gray-300 shadow-sm px-4 pt-3 pb-2"
        style={{ backgroundColor: headerBg }}
      >
        <div className="flex flex-col gap-4">
          {/* Título centralizado */}
          <div className="text-center">
            <h1
              className="font-bold text-base md:text-xl leading-tight"
              style={{ color: titleBlue }}
            >
              ESCALA DE MINISTROS EXTRAORDINÁRIOS DA DISTRIBUIÇÃO DA EUCARISTIA
            </h1>
            <p
              className="text-sm md:text-base font-semibold mt-1"
              style={{ color: textBrown }}
            >
              Paróquia Nossa Senhora das Graças
            </p>
          </div>

          {/* Linha inferior do cabeçalho: hambúrguer à esquerda (mobile) e saudação à direita */}
          <div className="flex items-start">
            {/* Botão hambúrguer (apenas mobile) */}
            <button
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border-2"
              style={{
                borderColor: titleBlue,
                color: titleBlue,
              }}
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Abrir menu"
              aria-expanded={mobileOpen}
              type="button"
            >
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                stroke="currentColor"
                fill="none"
                strokeWidth="2"
              >
                <path strokeLinecap="round" d="M4 7h16" />
                <path strokeLinecap="round" d="M4 12h16" />
                <path strokeLinecap="round" d="M4 17h16" />
              </svg>
            </button>

            {/* Saudação + Meu Perfil + Sair à direita (ml-auto empurra pro canto direito) */}
            <div className="flex flex-col items-end text-right leading-tight ml-auto">
              <span
                className="text-sm md:text-base"
                style={{ color: textBrown }}
              >
                Olá, {displayName || "Usuário"}
              </span>

              <Link
                to="/perfil"
                className="text-xs md:text-sm mt-1"
                style={{ color: titleBlue }}
              >
                Meu Perfil
              </Link>

              <button
                onClick={signOut}
                className="mt-3 text-sm md:text-base hover:underline"
                style={{ color: textBrown }}
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Menu desktop (sem Perfil) CENTRALIZADO */}
      <nav className="bg-white border-b border-gray-200 px-4 py-2 hidden md:block">
        <div className="flex flex-wrap justify-center gap-6">
          {MENU.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={linkClasses(item.path)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Menu lateral mobile (abre à direita) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-60 bg-white shadow-lg border-l border-gray-200 p-4 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: titleBlue }}>
                Menu
              </span>
              <button
                type="button"
                className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-300"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" d="M6 6l12 12" />
                  <path strokeLinecap="round" d="M18 6L6 18" />
                </svg>
              </button>
            </div>

            <nav className="mt-4 flex flex-col gap-3">
              {MENU.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={"block " + linkClasses(item.path)}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 bg-white shadow-inner overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export default Layout;
