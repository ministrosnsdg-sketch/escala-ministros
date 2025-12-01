import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

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

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center text-[9px]">
        <div className="font-semibold text-[#4A6FA5]">
          Cobertura — {label}
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

        <input
          type="number"
          className="border rounded px-2 py-1 w-16 text-[9px]"
          value={year}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > 1900) setYear(v);
          }}
        />

        {/* NOVO FILTRO DE STATUS */}
        <select
          className="border rounded px-2 py-1 text-[9px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">Todos os status</option>
          <option value="LOW">Abaixo do mínimo</option>
          <option value="FULL">Capacidade máxima</option>
          <option value="OK">OK</option>
        </select>
      </div>

      <div className="bg-[#F7FAFF] border border-[#D6E6F7] rounded-xl px-3 py-2 text-[9px] text-[#3F5F8F]">
        <p>
          Aqui você vê se cada missa atingiu o mínimo de ministros para o mês
          selecionado. Exibimos apenas números (sem nomes).
        </p>
      </div>

      {loading ? (
        <p className="text-[10px] text-gray-600">Carregando cobertura...</p>
      ) : error ? (
        <p className="text-[10px] text-red-600">{error}</p>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-[#D6E6F7] text-[10px] text-[#3F5F8F] font-semibold">
              Missas fixas
            </div>

            <table className="min-w-full text-[9px]">
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

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-[#F2E3FF] text-[10px] text-[#5B3FA6] font-semibold">
              Missas extras
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-[9px]">
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
