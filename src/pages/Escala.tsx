import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_NAMES = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

type MyAssignment = {
  date: string;
  kind: "Fixa" | "Extra" | "Disponibilidade";
  time: string;
  title?: string;
};

type DayAssignment = {
  date: string;
  time: string;
  type: "Fixa" | "Extra" | "Disponibilidade";
  title?: string;
  ministerName: string;
};

export default function EscalaPage() {
  return (
    <RequireAuth>
      <Layout>
        <EscalaInner />
      </Layout>
    </RequireAuth>
  );
}

function EscalaInner() {
  const { user } = useAuth();

  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  const firstDay = useMemo(() => new Date(year, month, 1), [year, month]);
  const lastDay = useMemo(() => new Date(year, month + 1, 0), [year, month]);
  const start = useMemo(() => iso(firstDay), [firstDay]);
  const end = useMemo(() => iso(lastDay), [lastDay]);
  const todayIso = iso(today);

  const [ministerId, setMinisterId] = useState<string | null>(null);

  const [horarioMap, setHorarioMap] = useState<Map<number, string>>(
    () => new Map()
  );
  const [ministerMap, setMinisterMap] = useState<Map<string, string>>(
    () => new Map()
  );
  const [extraInfoById, setExtraInfoById] = useState<
    Map<number, { date: string; time: string; title?: string }>
  >(() => new Map());

  const [extrasDates, setExtrasDates] = useState<Set<string>>(new Set());
  const [assignedDates, setAssignedDates] = useState<Set<string>>(new Set());
  const [myAssignments, setMyAssignments] = useState<MyAssignment[]>([]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayAssignments, setDayAssignments] = useState<DayAssignment[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [useAvailabilityFallback, setUseAvailabilityFallback] = useState(false);

  const [showMyAssignments, setShowMyAssignments] = useState(true);

  // Buscar ministro do usuário logado
  useEffect(() => {
    async function fetchMinister() {
      if (!user) return;
      const { data, error } = await supabase
        .from("ministers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data?.id) setMinisterId(data.id);
      else setMinisterId(null);
    }
    fetchMinister();
  }, [user]);

  // Carregar dados do mês
  useEffect(() => {
    if (!ministerId) {
      setLoading(false);
      setMyAssignments([]);
      setAssignedDates(new Set());
      setExtrasDates(new Set());
      return;
    }
    loadMonth();
  }, [ministerId, month, year]);

  async function loadMonth() {
    setLoading(true);
    setErr(null);
    setUseAvailabilityFallback(false);

    try {
      // HORÁRIOS
      const { data: hData } = await supabase
        .from("horarios")
        .select("id, time");
      const hMap = new Map<number, string>();
      (hData || []).forEach((h: any) => {
        hMap.set(h.id as number, (h.time as string) || "");
      });
      setHorarioMap(hMap);

      // MINISTROS
      const { data: mData } = await supabase
        .from("ministers")
        .select("id, name");
      const mMap = new Map<string, string>();
      (mData || []).forEach((m: any) => {
        mMap.set(m.id as string, (m.name as string) || "Sem nome");
      });
      setMinisterMap(mMap);

      // EXTRAS
      const { data: exData } = await supabase
        .from("extras")
        .select("id, event_date, time, title, min_required, max_allowed, active")
        .eq("active", true)
        .gte("event_date", start)
        .lte("event_date", end)
        .order("event_date")
        .order("time");

      const extraMap = new Map<
        number,
        { date: string; time: string; title?: string }
      >();
      const extraDateSet = new Set<string>();
      (exData || []).forEach((e: any) => {
        extraMap.set(e.id as number, {
          date: e.event_date as string,
          time: e.time as string,
          title: (e.title as string) || undefined,
        });
        extraDateSet.add(e.event_date as string);
      });
      setExtraInfoById(extraMap);
      setExtrasDates(extraDateSet);

      // MISSAS FINAIS (regular + extras)
      let regRows: any[] = [];
      let exAssRows: any[] = [];
      try {
        const { data, error } = await supabase
          .from("escala_regular")
          .select("date, horario_id, minister_id")
          .gte("date", start)
          .lte("date", end);
        if (!error && data) regRows = data as any[];
      } catch {}

      try {
        const { data, error } = await supabase
          .from("escala_extras")
          .select("extra_id, minister_id");
        if (!error && data) exAssRows = data as any[];
      } catch {}

      const hasFinalSchedule = regRows.length > 0 || exAssRows.length > 0;

      const assignedSet = new Set<string>();
      const myAss: MyAssignment[] = [];

      if (hasFinalSchedule) {
        // MINHAS MISSAS FIXAS
        regRows
          .filter((r) => r.minister_id === ministerId)
          .forEach((r) => {
            const time = hMap.get(r.horario_id as number) || "";
            const date = r.date as string;
            myAss.push({ date, kind: "Fixa", time });
            assignedSet.add(date);
          });

        // MINHAS MISSAS EXTRAS
        exAssRows
          .filter((r) => r.minister_id === ministerId)
          .forEach((r) => {
            const info = extraMap.get(r.extra_id as number);
            if (info) {
              myAss.push({
                date: info.date,
                kind: "Extra",
                time: info.time,
                title: info.title,
              });
              assignedSet.add(info.date);
            }
          });

        setUseAvailabilityFallback(false);
      } else {
        // FALLBACK: disponibilidades
        try {
          const { data: avData } = await supabase
            .from("monthly_availability_regular")
            .select("minister_id, date, horario_id")
            .gte("date", start)
            .lte("date", end);

          let avExtras: { minister_id: string; extra_id: number }[] = [];

          if (exData && (exData as any[]).length > 0) {
            const extraIds = (exData as any[]).map((e: any) => e.id);
            const { data: avExData } = await supabase
              .from("availability_extras")
              .select("minister_id, extra_id")
              .in("extra_id", extraIds);
            if (avExData) avExtras = avExData as any[];
          }

          const hasAny =
            (avData && (avData as any[]).length > 0) ||
            avExtras.length > 0;

          if (hasAny) {
            setUseAvailabilityFallback(true);

            (avData || []).forEach((r: any) => {
              if (r.minister_id !== ministerId) return;
              const time =
                horarioMap.get(r.horario_id as number) || "";
              myAss.push({
                date: r.date as string,
                kind: "Disponibilidade",
                time,
              });
              assignedSet.add(r.date as string);
            });

            avExtras.forEach((r) => {
              if (r.minister_id !== ministerId) return;
              const info = extraMap.get(r.extra_id as number);
              if (!info) return;
              myAss.push({
                date: info.date,
                kind: "Disponibilidade",
                time: info.time,
                title: info.title,
              });
              assignedSet.add(info.date);
            });
          }
        } catch {}
      }

      const inMonth = myAss.filter((a) => a.date >= start && a.date <= end);
      inMonth.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.time || "").localeCompare(b.time || "");
      });

      setMyAssignments(inMonth);
      setAssignedDates(assignedSet);
    } catch (e) {
      console.error(e);
      setErr("Não foi possível carregar a escala deste mês.");
      setMyAssignments([]);
      setAssignedDates(new Set());
      setExtrasDates(new Set());
      setUseAvailabilityFallback(false);
    } finally {
      setLoading(false);
    }
  }

  // Células do calendário (menor altura h-10)
  const days = lastDay.getDate();
  const firstWeekday = firstDay.getDay();
  const cells: { day?: number; date?: string }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({});
  for (let d = 1; d <= days; d++) {
    const dt = iso(new Date(year, month, d));
    cells.push({ day: d, date: dt });
  }

  async function handleDayClick(date?: string) {
    if (!date) return;
    setSelectedDate(date);
    setDayLoading(true);
    setDayAssignments([]);

    try {
      const list: DayAssignment[] = [];

      if (!useAvailabilityFallback) {
        // ESCALA FINAL
        try {
          const { data } = await supabase
            .from("escala_regular")
            .select("date, horario_id, minister_id")
            .eq("date", date);

          (data || []).forEach((r: any) => {
            const time = horarioMap.get(r.horario_id as number) || "";
            const ministerName =
              ministerMap.get(r.minister_id as string) || "—";
            list.push({
              date,
              time,
              type: "Fixa",
              ministerName,
            });
          });
        } catch {}

        try {
          const { data: dayExtras } = await supabase
            .from("extras")
            .select("id, time, title")
            .eq("event_date", date)
            .eq("active", true);

          if (dayExtras && dayExtras.length > 0) {
            const ids = dayExtras.map((e: any) => e.id);
            const { data: exScale } = await supabase
              .from("escala_extras")
              .select("extra_id, minister_id")
              .in("extra_id", ids);

            (exScale || []).forEach((r: any) => {
              const info = dayExtras.find((e: any) => e.id === r.extra_id);
              if (!info) return;
              const ministerName =
                ministerMap.get(r.minister_id as string) || "—";

              list.push({
                date,
                time: info.time,
                type: "Extra",
                title: info.title,
                ministerName,
              });
            });
          }
        } catch {}
      } else {
        // FALLBACK
        try {
          const { data: avData } = await supabase
            .from("monthly_availability_regular")
            .select("minister_id, date, horario_id")
            .eq("date", date);

          (avData || []).forEach((r: any) => {
            const time =
              horarioMap.get(r.horario_id as number) || "";
            const ministerName =
              ministerMap.get(r.minister_id as string) || "—";
            list.push({
              date,
              time,
              type: "Disponibilidade",
              ministerName,
            });
          });
        } catch {}

        try {
          const { data: extrasDay } = await supabase
            .from("extras")
            .select("id, time, title")
            .eq("event_date", date)
            .eq("active", true);

          if (extrasDay && extrasDay.length > 0) {
            const ids = extrasDay.map((e: any) => e.id);
            const { data: avExData } = await supabase
              .from("availability_extras")
              .select("minister_id, extra_id")
              .in("extra_id", ids);

            (avExData || []).forEach((r: any) => {
              const info = extrasDay.find((e: any) => e.id === r.extra_id);
              if (!info) return;
              const ministerName =
                ministerMap.get(r.minister_id as string) || "—";

              list.push({
                date,
                time: info.time,
                type: "Disponibilidade",
                title: info.title,
                ministerName,
              });
            });
          }
        } catch {}
      }

      list.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      setDayAssignments(list);
    } finally {
      setDayLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Cabeçalho / legenda */}
      <div className="flex gap-2 items-center text-[10px]">
  {/* Seletor de Mês — igual ao da Disponibilidade */}
  <select
    className="border rounded px-2 py-1 text-[10px]"
    value={month}
    onChange={(e) => setMonth(Number(e.target.value))}
  >
    {MONTH_NAMES.map((name, idx) => (
      <option key={idx} value={idx}>
        {name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()}
      </option>
    ))}
  </select>

  {/* Seletor de Ano — igual ao da Disponibilidade */}
  <select
    className="border rounded px-2 py-1 text-[10px] w-20"
    value={year}
    onChange={(e) => setYear(Number(e.target.value))}
  >
    {Array.from({ length: 10 }).map((_, i) => {
      const y = new Date().getFullYear() - 2 + i;
      return (
        <option key={y} value={y}>
          {y}
        </option>
      );
    })}
  </select>
</div>

      {/* Calendário */}
      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <div className="grid grid-cols-7 gap-2 mb-2 text-[10px] text-center text-gray-600">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className={i === 0 ? "text-red-600" : ""}>
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {cells.map((c, idx) => {
            if (!c.day || !c.date) {
              return (
                <div
                  key={idx}
                  className="h-10 rounded bg-gray-50 border border-dashed border-gray-200"
                />
              );
            }

            const isAssigned = assignedDates.has(c.date);
            const hasExtras = extrasDates.has(c.date);
            const isToday = c.date === todayIso;

            const base =
  "h-10 rounded border transition relative cursor-pointer";

const todayClass = isToday
  ? "border-green-600 border-2 bg-green-100"
  : "bg-white hover:bg-gray-50";

            return (
              <div
  key={idx}
  className={`${base} ${todayClass}`}
  onClick={() => handleDayClick(c.date)}
>
                <div className="absolute top-1 left-1 text-[11px] font-semibold text-gray-700">
                  {c.day}
                </div>
                <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 px-1">
                  {isAssigned && (
                    <span className="w-2 h-2 rounded-full bg-green-600" />
                  )}
                  {hasExtras && (
                    <span className="w-2 h-2 rounded-full bg-purple-600" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista: minhas marcações */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div
          className="px-3 py-2 bg-[#D6E6F7] text-[10px] text-[#3F5F8F] font-semibold flex justify-between items-center cursor-pointer"
          onClick={() => setShowMyAssignments(!showMyAssignments)}
        >
          {useAvailabilityFallback
            ? "Suas disponibilidades deste mês"
            : "Suas celebrações deste mês"}

          <span className="text-[9px] text-[#4A6FA5] underline">
            {showMyAssignments ? "Ocultar" : "Mostrar"}
          </span>
        </div>

        {showMyAssignments && (
          <>
            {loading ? (
              <div className="p-3 text-[10px] text-gray-600">
                Carregando...
              </div>
            ) : err ? (
              <div className="p-3 text-[10px] text-red-600">{err}</div>
            ) : myAssignments.length === 0 ? (
              <div className="p-3 text-[10px] text-gray-600">
                {useAvailabilityFallback
                  ? "Nenhuma disponibilidade registrada para este mês."
                  : "Nenhuma escala registrada para este mês."}
              </div>
            ) : (
              <table className="min-w-full text-[10px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left">Data</th>
                    <th className="px-2 py-1 text-center">Hora</th>
                    <th className="px-2 py-1 text-left">Título</th>
                  </tr>
                </thead>
                <tbody>
                  {myAssignments.map((a, i) => {
                    const isTodayRow = a.date === todayIso;
                    const rowClass =
                      "border-t border-gray-100" +
                      (isTodayRow ? " bg-green-50" : "");

                    const strongCell =
                      "px-2 py-1" +
                      (isTodayRow
                        ? " text-green-700 font-semibold"
                        : "");
                    const normalCell = "px-2 py-1";

                    return (
                      <tr
                        key={`${a.date}-${a.time}-${i}`}
                        className={rowClass}
                      >
                        <td className={strongCell}>
                          {a.date.split("-").reverse().join("/")}
                        </td>
                        <td className={strongCell + " text-center"}>
{a.time && a.time.length >= 5 ? a.time.slice(0, 5) + "h" : "—"}
</td>
                        <td className={normalCell}>
                          {a.title ||
                            (a.kind === "Fixa"
                              ? "Missa"
                              : a.kind === "Extra"
                              ? "Missa Extra"
                              : "")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* Modal: detalhes do dia */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/30 flex items-start justify-center z-50">
          <div className="mt-24 w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[#4A6FA5]">
                Escala do dia{" "}
                {selectedDate.split("-").reverse().join("/")}
              </h3>
              <button
                onClick={() => {
                  setSelectedDate(null);
                  setDayAssignments([]);
                }}
                className="text-[10px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
              >
                Fechar
              </button>
            </div>

            {dayLoading ? (
              <div className="text-[10px] text-gray-600">
                Carregando informações...
              </div>
            ) : dayAssignments.length === 0 ? (
              <div className="text-[10px] text-gray-600">
                {useAvailabilityFallback
                  ? "Nenhum ministro disponível para este dia."
                  : "Nenhum ministro escalado para este dia."}
              </div>
            ) : (
              (() => {
                const grouped: Record<string, DayAssignment[]> =
                  dayAssignments.reduce(
                    (acc: Record<
                      string,
                      DayAssignment[]
                    >, a) => {
                      const key = a.time || "";
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(a);
                      return acc;
                    },
                    {}
                  );

                const times = Object.keys(grouped).sort();

                return (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {times.map((time) => {
                      const entries = grouped[time];
                      return (
                        <div
                          key={time}
                          className="border-b last:border-b-0 pb-2"
                        >
                          <div className="text-xs font-semibold text-gray-800">
                            {entries[0].title ? (
                              <>
                                {time.slice(0, 5)}h –{" "}
                                <span className="text-purple-600 font-semibold">
                                  {entries[0].title}
                                </span>
                              </>
                            ) : (
                              `${time.slice(0, 5)}h`
                            )}
                          </div>

                          <div className="mt-1 text-[11px] text-[#4A6FA5] leading-snug">
                            {entries.map((entry, idx) => (
                              <span key={idx}>
                                {idx > 0 && " - "}
                                {entry.ministerName}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}
