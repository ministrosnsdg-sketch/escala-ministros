import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Minister = {
  id: string;
  name: string;
};

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ResumoPorMinistro() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // Mês padrão = próximo mês
  const now = new Date();
  const defaultMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const defaultYear =
    now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);

  const first = useMemo(() => new Date(year, month, 1), [year, month]);
  const last = useMemo(() => new Date(year, month + 1, 0), [year, month]);
  const start = iso(first);
  const end = iso(last);
  const label = `${MONTH_NAMES[month]} / ${year}`;

  const [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState<
    { minister_id: string; name: string; total: number }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<
    "all" | "green" | "orange" | "red"
  >("all");

  // verifica admin
  useEffect(() => {
    const check = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("ministers")
        .select("is_admin")
        .eq("user_id", user.id)
        .maybeSingle();
      setIsAdmin(!!data?.is_admin);
    };
    check();
  }, [user]);

  useEffect(() => {
    if (isAdmin) loadRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, month, year]);

  async function loadRanking() {
    setLoading(true);
    setError(null);

    // ministros
    const { data: mData, error: mErr } = await supabase
      .from("ministers")
      .select("id, name")
      .order("name");

    if (mErr) {
      setError("Erro ao carregar ministros.");
      setLoading(false);
      return;
    }

    const ministers = (mData || []) as Minister[];

    // disponibilidade regular
    const { data: avData, error: avErr } = await supabase
      .from("monthly_availability_regular")
      .select("minister_id, date")
      .gte("date", start)
      .lte("date", end);

    if (avErr) {
      setError("Erro ao carregar disponibilidades.");
      setLoading(false);
      return;
    }

    // buscar extras do mês
    const { data: exData, error: exErr } = await supabase
      .from("extras")
      .select("id, event_date")
      .gte("event_date", start)
      .lte("event_date", end)
      .eq("active", true);

    if (exErr) {
      setError("Erro ao carregar missas extras.");
      setLoading(false);
      return;
    }

    const extraIds = (exData || []).map((e: any) => e.id);

    let avExtras: { minister_id: string; extra_id: number }[] = [];

    if (extraIds.length > 0) {
      const { data: avExData } = await supabase
        .from("availability_extras")
        .select("minister_id, extra_id")
        .in("extra_id", extraIds);

      avExtras = (avExData || []) as any;
    }

    const counter = new Map<string, number>();

    // contar disponibilidade regular
    (avData || []).forEach((row: any) => {
      counter.set(row.minister_id, (counter.get(row.minister_id) || 0) + 1);
    });

    // contar extras
    avExtras.forEach((row) => {
      counter.set(row.minister_id, (counter.get(row.minister_id) || 0) + 1);
    });

    const list = ministers
      .map((m) => ({
        minister_id: m.id,
        name: m.name,
        total: counter.get(m.id) || 0,
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    setRanking(list);
    setLoading(false);
  }

  if (!isAdmin) {
    return (
      <p className="text-[10px] text-gray-600">
        Apenas administradores podem visualizar o resumo por ministro.
      </p>
    );
  }

  function getColor(total: number) {
    if (total >= 6) return "text-green-600 font-bold";
    if (total >= 1) return "text-orange-500 font-bold";
    return "text-red-600 font-bold";
  }

  function getStatus(total: number) {
    if (total >= 6) return "green"; // Acima de 6
    if (total >= 1) return "orange"; // Abaixo de 6
    return "red"; // Nenhuma data
  }

  const filteredRanking = ranking.filter((r) => {
    const st = getStatus(r.total);
    if (statusFilter === "all") return true;
    return st === statusFilter;
  });

  function exportPDF() {
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text(`Resumo por Ministro — ${label}`, 14, 14);

    const rows = filteredRanking.map((r, i) => [i + 1, r.name, r.total]);

    autoTable(doc, {
      head: [["Posição", "Ministro", "Total de escolhas"]],
      body: rows,
      startY: 25,
      headStyles: { fillColor: [74, 111, 165] },
      styles: { fontSize: 10 },
    });

    doc.save(`resumo-ministros-${month + 1}-${year}.pdf`);
  }

  return (
    <section className="space-y-3">
      {/* Seletores */}
      <div className="flex flex-wrap gap-2 items-center text-[9px]">
        <div className="font-semibold text-[#4A6FA5]">
          Resumo por ministro — {label}
        </div>

        <select
          className="border rounded px-2 py-1 text-[9px]"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i} value={i}>
              {name}
            </option>
          ))}
        </select>

        <select
  className="border rounded px-2 py-1 text-[9px] w-20"
  value={year}
  onChange={(e) => setYear(Number(e.target.value))}
>
  {Array.from({ length: 10 }).map((_, i) => {
    const y = new Date().getFullYear() - 2 + i; // 2 anos antes até 7 anos depois
    return (
      <option key={y} value={y}>
        {y}
      </option>
    );
  })}
</select>

      </div>

      {/* Informativo */}
      <div className="bg-[#F7FAFF] border border-[#D6E6F7] rounded-xl px-3 py-2 text-[9px] text-[#3F5F8F]">
        <p>
          Cada marcação de disponibilidade (missa fixa ou extra) conta 1 ponto.
          A lista abaixo mostra quem mais se colocou disponível no período.
        </p>
      </div>

      {/* Legenda */}
      <div className="flex gap-3 text-[9px] items-center">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-500"></span>
          <span>Acima de 6</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-orange-400"></span>
          <span>Abaixo de 6</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-500"></span>
          <span>Nenhuma data</span>
        </div>
      </div>

      {/* Filtro */}
      <div className="text-[9px]">
        <label className="mr-2 text-[#4A6FA5] font-semibold">
          Filtrar por disponibilidade:
        </label>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="border rounded px-2 py-1 text-[9px]"
        >
          <option value="all">Todos os ministros</option>
          <option value="green">Acima de 6</option>
          <option value="orange">Abaixo de 6</option>
          <option value="red">Nenhuma data</option>
        </select>
      </div>

      {/* Erro */}
      {error && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-[10px] text-gray-600">Calculando resumo...</p>
      ) : filteredRanking.length === 0 ? (
        <p className="text-[9px] text-gray-500">
          Nenhuma disponibilidade registrada para este mês.
        </p>
      ) : (
        <>
          {/* Botão PDF */}
          <button
            onClick={exportPDF}
            className="px-3 py-1 text-[9px] bg-[#4A6FA5] text-white rounded hover:bg-[#3F5F8F]"
          >
            Exportar PDF
          </button>

          {/* Tabela */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mt-2">
            <table className="min-w-full text-[9px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-center">Posição</th>
                  <th className="px-2 py-1 text-left">Ministro</th>
                  <th className="px-2 py-1 text-center">
                    Qtde de missas selecionadas
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRanking.map((r, i) => (
                  <tr key={r.minister_id} className="border-t border-gray-100">
                    <td className="px-2 py-1 text-center font-semibold text-[#4A6FA5]">
                      {i + 1}
                    </td>
                    <td className="px-2 py-1">{r.name}</td>
                    <td className={`px-2 py-1 text-center ${getColor(r.total)}`}>
                      {r.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
