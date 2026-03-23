import { useState } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";

import RelatorioDisponibilidade from "./relatorios/RelatorioDisponibilidade";
import AdminInviteCodes from "./relatorios/AdminInviteCodes";
import DisponibilidadeJanelaConfig from "./relatorios/DisponibilidadeJanelaConfig";
import ResumoPorMinistro from "./relatorios/ResumoPorMinistro";

// 🆕 IMPORTAR O NOVO RELATÓRIO
import BloqueiosDeMissas from "./relatorios/BloqueiosDeMissas";
import Aniversariantes from "./relatorios/Aniversariantes";
import NotificacoesAdmin from "./relatorios/NotificacoesAdmin";

type TabKey = "coverage" | "codes" | "settings" | "ranking" | "blocked" | "birthdays" | "notifications";

export default function RelatoriosPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("coverage");

  return (
    <RequireAuth adminOnly>
      <Layout>
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Cabeçalho */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-[#4A6FA5]">
                Relatórios & Administração
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Painel interno da coordenação</p>
            </div>
          </div>

          {/* Abas */}
          <div className="flex flex-wrap gap-1 text-sm">
            <TabButton
              label="Cobertura de horários"
              active={activeTab === "coverage"}
              onClick={() => setActiveTab("coverage")}
            />

            <TabButton
              label="Bloqueios de missas"
              active={activeTab === "blocked"}
              onClick={() => setActiveTab("blocked")}
            />

            <TabButton
              label="Códigos de acesso"
              active={activeTab === "codes"}
              onClick={() => setActiveTab("codes")}
            />

            <TabButton
              label="Janela de disponibilidade"
              active={activeTab === "settings"}
              onClick={() => setActiveTab("settings")}
            />

            <TabButton
              label="Resumo por ministro"
              active={activeTab === "ranking"}
              onClick={() => setActiveTab("ranking")}
            />

            <TabButton
              label="Aniversariantes"
              active={activeTab === "birthdays"}
              onClick={() => setActiveTab("birthdays")}
            />

            <TabButton
              label="Notificações"
              active={activeTab === "notifications"}
              onClick={() => setActiveTab("notifications")}
            />
          </div>

          {/* Conteúdo da aba */}
          {activeTab === "coverage" && <RelatorioDisponibilidade />}
          {activeTab === "blocked" && <BloqueiosDeMissas />}
          {activeTab === "codes" && <AdminInviteCodes />}
          {activeTab === "settings" && <DisponibilidadeJanelaConfig />}
          {activeTab === "ranking" && <ResumoPorMinistro />}
          {activeTab === "birthdays" && <Aniversariantes />}
          {activeTab === "notifications" && <NotificacoesAdmin />}
        </div>
      </Layout>
    </RequireAuth>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${active ? "bg-[#4A6FA5] text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
    >
      {label}
    </button>
  );
}
