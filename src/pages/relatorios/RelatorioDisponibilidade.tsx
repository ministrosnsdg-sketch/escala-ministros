import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Horario = {
  id: number;
  weekday: number;
  time: string;
  min_required: number;
  max_allowed: number;
  active: boolean;
};

type Extra = {
  id: number;
  event_date: string;
  time: string;
  title: string;
  min_required: number;
  max_allowed: number;
  active: boolean;
};

const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

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

export default function RelatorioDisponibilidade() {
  const now = new Date();
  const defaultMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const defaultYear =
    now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);

  const [statusFilter, setStatusFilter] = useState("ALL");

  const firstDay = useMemo(() => new Date(year, month, 1), [year, month]);
  const lastDay = useMemo(() => new Date(year, month + 1, 0), [year, month]);
  const start = useMemo(() => iso(firstDay), [firstDay]);
  const end = useMemo(() => iso(lastDay), [lastDay]);
  const label = useMemo(
    () => `${MONTH_NAMES[month]} / ${year}`,
    [month, year]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [extraCounts, setExtraCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    loadData();
  }, [month, year]);

  async function loadData() {
    setLoading(true);
    setError(null);

    const { data: hData, error: hErr } = await supabase
      .from("horarios")
      .select("*")
      .eq("active", true)
      .order("weekday")
      .order("time");

    if (hErr) {
      console.error(hErr);
      setError("Erro ao carregar horários.");
      setLoading(false);
      return;
    }
    setHorarios((hData || []) as Horario[]);

    const { data: exData, error: exErr } = await supabase
      .from("extras")
      .select("*")
      .eq("active", true)
      .gte("event_date", start)
      .lte("event_date", end)
      .order("event_date")
      .order("time");

    if (exErr) {
      console.error(exErr);
      setError("Erro ao carregar missas extras.");
      setLoading(false);
      return;
    }
    setExtras((exData || []) as Extra[]);

    const { data: cData, error: cErr } = await supabase.rpc(
      "get_slot_availability_counts",
      { start_date: start, end_date: end }
    );

    if (cErr) {
      console.error(cErr);
      setError("Erro ao calcular cobertura de horários.");
      setLoading(false);
      return;
    }

    const mapSlots: Record<string, number> = {};
    (cData || []).forEach((r: any) => {
      const key = `${r.date}|${r.horario_id}`;
      mapSlots[key] = r.total;
    });
    setSlotCounts(mapSlots);

    const { data: exCount, error: exCountErr } = await supabase.rpc(
      "get_extra_availability_counts",
      { start_date: start, end_date: end }
    );

    if (exCountErr) {
      console.error(exCountErr);
      setError("Erro ao calcular cobertura das missas extras.");
      setLoading(false);
      return;
    }

    const mapExtras: Record<number, number> = {};
    (exCount || []).forEach((r: any) => {
      mapExtras[r.extra_id] = r.total;
    });
    setExtraCounts(mapExtras);

    setLoading(false);
  }

  const daysInMonth = lastDay.getDate();

  const fixedRows = useMemo(() => {
    const rows: {
      date: string;
      weekday: string;
      time: string;
      min: number;
      max: number;
      current: number;
    }[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const current = new Date(year, month, day);
      const date = iso(current);
      const wd = current.getDay();

      horarios
        .filter((h) => h.weekday === wd && h.active)
        .forEach((h) => {
          const key = `${date}|${h.id}`;
          rows.push({
            date,
            weekday: WEEKDAYS[wd],
            time: h.time.slice(0, 5),
            min: h.min_required,
            max: h.max_allowed,
            current: slotCounts[key] || 0,
          });
        });
    }

    return rows;
  }, [daysInMonth, year, month, horarios, slotCounts]);

  const extraRows = useMemo(
    () =>
      extras.map((e) => {
        const d = new Date(e.event_date + "T00:00:00");
        const wd = d.getDay();
        return {
          id: e.id,
          date: e.event_date,
          weekday: WEEKDAYS[wd],
          title: e.title,
          time: e.time.slice(0, 5),
          min: e.min_required,
          max: e.max_allowed,
          current: extraCounts[e.id] || 0,
        };
      }),
    [extras, extraCounts]
  );

  function applyStatusFilter(row: { current: number; min: number; max: number }) {
    const falta = row.current < row.min;
    const cheio = row.current >= row.max;

    if (statusFilter === "LOW") return falta;
    if (statusFilter === "FULL") return cheio;
    if (statusFilter === "OK") return !falta && !cheio;
    return true; // ALL
  }

  function exportPDF() {
    // Rótulo do filtro atual para o título do PDF
    const filterLabel =
      statusFilter === "LOW"
        ? "Abaixo do mínimo"
        : statusFilter === "FULL"
        ? "Capacidade máxima"
        : statusFilter === "OK"
        ? "OK"
        : "Todos";

    const doc = new jsPDF("p", "mm", "a4");

    // Cabeçalho
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 110);
    doc.text("Cobertura de horários", 14, 16);

    doc.setFontSize(11);
    doc.setTextColor(74, 111, 165);
    doc.text(`${label}  —  Filtro: ${filterLabel}`, 14, 23);

    let cursorY = 30;

    // Aplica o filtro nas linhas (mesma regra da tela)
    const fixedFiltered = fixedRows.filter(applyStatusFilter);
    const extraFiltered = extraRows.filter(applyStatusFilter);

    function statusOf(r: { current: number; min: number; max: number }) {
      const falta = r.current < r.min;
      const cheio = r.current >= r.max;
      return falta ? "Abaixo do mínimo" : cheio ? "Capacidade máxima" : "OK";
    }

    // Tabela: Missas fixas
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 110);
    doc.text("Missas fixas", 14, cursorY);
    cursorY += 4;

    if (fixedFiltered.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text("Nenhum registro para este filtro.", 14, cursorY + 4);
      cursorY += 12;
    } else {
      autoTable(doc, {
        head: [["Data", "Dia", "Hora", "Mín.", "Máx.", "Selecionados", "Status"]],
        body: fixedFiltered.map((r) => [
          r.date.split("-").reverse().join("/"),
          r.weekday,
          `${r.time}h`,
          r.min,
          r.max,
          r.current,
          statusOf(r),
        ]),
        startY: cursorY,
        headStyles: { fillColor: [74, 111, 165] },
        styles: { fontSize: 9 },
        columnStyles: {
          2: { halign: "center" },
          3: { halign: "center" },
          4: { halign: "center" },
          5: { halign: "center" },
          6: { halign: "center" },
        },
      });
      cursorY = (doc as any).lastAutoTable.finalY + 8;
    }

    // Tabela: Missas extras
    doc.setFontSize(12);
    doc.setTextColor(124, 58, 237); // roxo, mesmo padrão usado em Missas Solenes
    doc.text("Missas extras", 14, cursorY);
    cursorY += 4;

    if (extraFiltered.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text("Nenhum registro para este filtro.", 14, cursorY + 4);
    } else {
      autoTable(doc, {
        head: [
          ["Data", "Dia", "Título", "Hora", "Mín.", "Máx.", "Selecionados", "Status"],
        ],
        body: extraFiltered.map((e) => [
          e.date.split("-").reverse().join("/"),
          e.weekday,
          e.title,
          `${e.time}h`,
          e.min,
          e.max,
          e.current,
          statusOf(e),
        ]),
        startY: cursorY,
        headStyles: { fillColor: [124, 58, 237] },
        styles: { fontSize: 9 },
        columnStyles: {
          3: { halign: "center" },
          4: { halign: "center" },
          5: { halign: "center" },
          6: { halign: "center" },
          7: { halign: "center" },
        },
      });
    }

    // Nome do arquivo
    const slug =
      statusFilter === "LOW"
        ? "abaixo-minimo"
        : statusFilter === "FULL"
        ? "capacidade-maxima"
        : statusFilter === "OK"
        ? "ok"
        : "todos";
    doc.save(`cobertura-${slug}-${month + 1}-${year}.pdf`);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <div className="font-semibold text-[#4A6FA5]">
          Cobertura — {label}
        </div>

        <select
          className="border rounded px-2 py-1 text-xs"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i} value={i}>
              {name}
            </option>
          ))}
        </select>

        <input
          type="number"
          className="border rounded px-2 py-1 w-16 text-xs"
          value={year}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > 1900) setYear(v);
          }}
        />

        {/* NOVO FILTRO DE STATUS */}
        <select
          className="border rounded px-2 py-1 text-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">Todos os status</option>
          <option value="LOW">Abaixo do mínimo</option>
          <option value="FULL">Capacidade máxima</option>
          <option value="OK">OK</option>
        </select>

        {/* BOTÃO DE GERAR PDF — respeita o filtro acima */}
        <button
          onClick={exportPDF}
          disabled={loading}
          className="ml-auto bg-[#4A6FA5] hover:bg-[#3F5F8F] disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-colors flex items-center gap-1"
          title="Gera o PDF apenas com os registros do filtro selecionado"
        >
          <span>📄</span>
          <span>Gerar PDF</span>
        </button>
      </div>

      <div className="bg-[#F0F4FA] border border-[#D6E6F7] rounded-2xl px-4 py-3 text-sm text-[#3F5F8F]">
        <p>
          Aqui você vê se cada missa atingiu o mínimo de ministros para o mês
          selecionado. Exibimos apenas números (sem nomes).
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-600">Carregando cobertura...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-[#EEF4FF] to-[#F8FAFF] text-sm font-bold text-[#1E3A6E] border-b border-[#D6E6F7]">
              Missas fixas
            </div>

            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left">Data</th>
                  <th className="px-2 py-1 text-left">Dia</th>
                  <th className="px-2 py-1 text-center">Hora</th>
                  <th className="px-2 py-1 text-center">Mín.</th>
                  <th className="px-2 py-1 text-center">Máx.</th>
                  <th className="px-2 py-1 text-center">Selecionados</th>
                  <th className="px-2 py-1 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {fixedRows
                  .filter(applyStatusFilter)
                  .map((r, i) => {
                    const falta = r.current < r.min;
                    const cheio = r.current >= r.max;
                    const status = falta
                      ? "Abaixo do mínimo"
                      : cheio
                      ? "Capacidade máxima"
                      : "OK";
                    const color = falta
                      ? "text-red-600"
                      : cheio
                      ? "text-yellow-600"
                      : "text-green-600";

                    return (
                      <tr
                        key={i}
                        className="border-t border-gray-100 align-middle"
                      >
                        <td className="px-2 py-1">
                          {r.date.split("-").reverse().join("/")}
                        </td>
                        <td className="px-2 py-1">{r.weekday}</td>
                        <td className="px-2 py-1 text-center">{r.time}h</td>
                        <td className="px-2 py-1 text-center">{r.min}</td>
                        <td className="px-2 py-1 text-center">{r.max}</td>
                        <td className="px-2 py-1 text-center">{r.current}</td>
                        <td className={`px-2 py-1 text-center ${color}`}>
                          {status}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-white text-sm font-bold text-purple-700 border-b border-purple-100">
              Missas extras
            </div>

            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left">Data</th>
                    <th className="px-2 py-1 text-left">Dia</th>
                    <th className="px-2 py-1 text-left">Título</th>
                    <th className="px-2 py-1 text-center">Hora</th>
                    <th className="px-2 py-1 text-center">Mín.</th>
                    <th className="px-2 py-1 text-center">Máx.</th>
                    <th className="px-2 py-1 text-center">Selecionados</th>
                    <th className="px-2 py-1 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {extraRows
                    .filter(applyStatusFilter)
                    .map((e) => {
                      const falta = e.current < e.min;
                      const cheio = e.current >= e.max;
                      const status = falta
                        ? "Abaixo do mínimo"
                        : cheio
                        ? "Capacidade máxima"
                        : "OK";

                      const color = falta
                        ? "text-red-600"
                        : cheio
                        ? "text-yellow-600"
                        : "text-green-600";

                      return (
                        <tr
                          key={e.id}
                          className="border-t border-gray-100 align-middle"
                        >
                          <td className="px-2 py-1">
                            {e.date.split("-").reverse().join("/")}
                          </td>
                          <td className="px-2 py-1">{e.weekday}</td>
                          <td className="px-2 py-1">{e.title}</td>
                          <td className="px-2 py-1 text-center">{e.time}h</td>
                          <td className="px-2 py-1 text-center">{e.min}</td>
                          <td className="px-2 py-1 text-center">{e.max}</td>
                          <td className="px-2 py-1 text-center">{e.current}</td>
                          <td className={`px-2 py-1 text-center ${color}`}>
                            {status}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
