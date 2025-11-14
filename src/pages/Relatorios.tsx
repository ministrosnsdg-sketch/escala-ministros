import { useState } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import RelatorioDisponibilidade from "./relatorios/RelatorioDisponibilidade";
import AdminInviteCodes from "./relatorios/AdminInviteCodes";
import DisponibilidadeJanelaConfig from "./relatorios/DisponibilidadeJanelaConfig";
import ResumoPorMinistro from "./relatorios/ResumoPorMinistro";

type TabKey = "coverage" | "codes" | "settings" | "ranking";

export default function RelatoriosPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("coverage");

  return (
    <RequireAuth>
      <Layout>
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Cabeçalho */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[#4A6FA5]">
                Relatórios & Administração
              </h2>
              <p className="text-[10px] text-gray-700">
                Painel interno da coordenação: cobertura de horários, códigos de
                acesso, janela de edição e resumo por ministro.
              </p>
            </div>
          </div>

          {/* Abas */}
          <div className="flex flex-wrap gap-2 text-[9px]">
            <TabButton
              label="Cobertura de horários"
              active={activeTab === "coverage"}
              onClick={() => setActiveTab("coverage")}
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
          </div>

          {/* Conteúdo da aba */}
          {activeTab === "coverage" && <RelatorioDisponibilidade />}
          {activeTab === "codes" && <AdminInviteCodes />}
          {activeTab === "settings" && <DisponibilidadeJanelaConfig />}
          {activeTab === "ranking" && <ResumoPorMinistro />}
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
      className={`px-3 py-1.5 rounded-full border transition ${
        active
          ? "bg-[#4A6FA5] text-white border-[#4A6FA5]"
          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}
