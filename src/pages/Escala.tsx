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

// NOVO TIPO PARA BLOQUEIOS
type BlockedMasses = {
  date: string;
  blocked_times: string[] | null;
  reason?: string;
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
  
  // NOVOS ESTADOS PARA BLOQUEIOS
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());
  const [blockedMasses, setBlockedMasses] = useState<BlockedMasses[]>([]);

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
      // HORÁRIOS (com weekday para validação anti-ghost)
      const { data: hData } = await supabase
        .from("horarios")
        .select("id, time, weekday");
      const hMap = new Map<number, string>();
      const hWeekdayMap = new Map<number, number>(); // horario_id → weekday
      (hData || []).forEach((h: any) => {
        hMap.set(h.id as number, (h.time as string) || "");
        hWeekdayMap.set(h.id as number, h.weekday as number);
      });
      setHorarioMap(hMap);

      // MINISTROS
      // ✅ Nota sobre o Ghost User: A solução para o Marcos Junior deve ser feita no banco de dados, 
      // garantindo que ele não esteja mais em 'ministers' ou em nenhuma tabela de escala/disponibilidade.
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

      // NOVO: BLOQUEIOS
      const { data: blocksData } = await supabase
        .from("blocked_masses")
        .select("date, blocked_times, reason")
        .gte("date", start)
        .lte("date", end);

      const blocks = (blocksData || []).map((b: any) => ({
  ...b,
  blocked_times: Array.isArray(b.blocked_times)
    ? b.blocked_times
    : [],
}));

setBlockedMasses(blocks);

      const blockedDatesSet = new Set<string>();
      blocks.forEach(b => {
        // A data está bloqueada se: blocked_times for NULL (dia todo bloqueado) OU blocked_times for um array não vazio
        if (!b.blocked_times || b.blocked_times.length > 0) {
          blockedDatesSet.add(b.date);
        }
      });
      setBlockedDates(blockedDatesSet);

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
        // MINHAS MISSAS FIXAS (com filtro anti-ghost)
        regRows
          .filter((r) => r.minister_id === ministerId)
          .forEach((r) => {
            const time = hMap.get(r.horario_id as number) || "";
            const date = r.date as string;
            // Anti-ghost: validar que o horario_id pertence ao weekday correto
            const expectedWeekday = new Date(date + "T00:00:00").getDay();
            const horarioWeekday = hWeekdayMap.get(r.horario_id as number);
            if (horarioWeekday !== undefined && horarioWeekday !== expectedWeekday) return;
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
              // Anti-ghost: validar weekday
              const date = r.date as string;
              const expectedWeekday = new Date(date + "T00:00:00").getDay();
              const horarioWeekday = hWeekdayMap.get(r.horario_id as number);
              if (horarioWeekday !== undefined && horarioWeekday !== expectedWeekday) return;
              const time =
                hMap.get(r.horario_id as number) || "";
              myAss.push({
                date,
                kind: "Disponibilidade",
                time,
              });
              assignedSet.add(date);
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

      // Buscar horários VÁLIDOS para este dia da semana (anti-ghost)
      const dow = new Date(date + "T00:00:00").getDay();
      const { data: validHorarios } = await supabase
        .from("horarios")
        .select("id, time")
        .eq("weekday", dow)
        .eq("active", true);
      const validHorarioIds = new Set((validHorarios || []).map((h: any) => h.id));
      const validTimesSet = new Set((validHorarios || []).map((h: any) => String(h.time).slice(0, 5)));

      if (!useAvailabilityFallback) {
        // ESCALA FINAL
        try {
          const { data } = await supabase
            .from("escala_regular")
            .select("date, horario_id, minister_id")
            .eq("date", date);

          (data || []).forEach((r: any) => {
            // FILTRO ANTI-GHOST: só incluir se o horario_id é válido para este weekday
            if (!validHorarioIds.has(r.horario_id as number)) return;
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
              .select("extra_id, minister_id");

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
        // FALLBACK (Disponibilidade)
        try {
          const { data: avData } = await supabase
            .from("monthly_availability_regular")
            .select("minister_id, date, horario_id")
            .eq("date", date);

          (avData || []).forEach((r: any) => {
            // FILTRO ANTI-GHOST: só incluir se o horario_id é válido para este weekday
            if (!validHorarioIds.has(r.horario_id as number)) return;
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

      // Missas Solenes têm prioridade: remover missas fixas quando existe extra no mesmo horário
      const extraTimes = new Set(
        list.filter(a => a.type === "Extra" || (a.type === "Disponibilidade" && a.title)).map(a => a.time.slice(0, 5))
      );
      const filtered = list.filter(a => {
        if ((a.type === "Fixa" || (a.type === "Disponibilidade" && !a.title)) && extraTimes.has(a.time.slice(0, 5))) {
          return false;
        }
        return true;
      });

      // Injetar horários bloqueados VÁLIDOS para este dia da semana
      const dayBlock = blockedMasses.find(b => b.date === date);
      if (dayBlock && Array.isArray(dayBlock.blocked_times) && dayBlock.blocked_times.length > 0) {
        // Buscar horários fixos reais deste dia da semana
        const dow = new Date(date + "T00:00:00").getDay();
        const { data: weekdayHorarios } = await supabase
          .from("horarios")
          .select("time")
          .eq("weekday", dow)
          .eq("active", true);
        const validTimes = new Set((weekdayHorarios || []).map((h: any) => String(h.time).slice(0, 5)));

        dayBlock.blocked_times.forEach((hhmm: string) => {
          const normalized = hhmm.slice(0, 5);
          const alreadyInList = filtered.some(a => a.time.slice(0, 5) === normalized);
          if (!alreadyInList && validTimes.has(normalized)) {
            filtered.push({
              date,
              time: hhmm,
              type: useAvailabilityFallback ? "Disponibilidade" : "Fixa",
              ministerName: "",
            });
          }
        });
      }

      filtered.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      setDayAssignments(filtered);
    } finally {
      setDayLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1E3A6E]">Minha Escala</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {useAvailabilityFallback ? "Mostrando suas disponibilidades" : "Suas missas confirmadas"}
          </p>
        </div>

        <div className="flex gap-1.5 items-center">
          <select
            className="border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm font-medium bg-white focus:border-[#4A6FA5] focus:outline-none"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select
            className="border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm font-medium bg-white w-20 focus:border-[#4A6FA5] focus:outline-none"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 10 }).map((_, i) => {
              const y = new Date().getFullYear() - 2 + i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Calendário */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-[#1E3A6E] to-[#4A6FA5] px-4 py-3">
          <div className="grid grid-cols-7 text-center">
            {["D","S","T","Q","Q","S","S"].map((w, i) => (
              <div key={i} className={`text-xs font-bold ${i === 0 ? "text-red-300" : "text-blue-200"}`}>{w}</div>
            ))}
          </div>
        </div>

        <div className="p-2">
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, idx) => {
              if (!c.day || !c.date) {
                return <div key={idx} className="h-11 rounded-xl" />;
              }

              const isAssigned = assignedDates.has(c.date);
              const hasExtras = extrasDates.has(c.date);
              const isToday = c.date === todayIso;
              const isBlocked = blockedDates.has(c.date);
              // Só ofusca se bloqueado E não tiver missas solenes (extras) no dia
              const shouldDim = isBlocked && !hasExtras;

              return (
                <button
                  key={idx}
                  className={`h-11 rounded-xl flex flex-col items-center justify-center relative transition-all active:scale-95 ${
                    isToday
                      ? "bg-[#4A6FA5] text-white shadow-md shadow-blue-100"
                      : isAssigned
                      ? "bg-green-50 border-2 border-green-400"
                      : "bg-gray-50 border border-gray-200 hover:border-gray-300"
                  } ${shouldDim ? "opacity-50" : ""}`}
                  onClick={() => handleDayClick(c.date)}
                >
                  <span className={`text-sm font-bold leading-none ${isToday ? "text-white" : "text-gray-700"}`}>
                    {c.day}
                  </span>
                  <div className="flex gap-0.5 mt-0.5">
                    {isAssigned && !isToday && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                    {hasExtras && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                    {isBlocked && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-[#4A6FA5]" />Hoje</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500" />{useAvailabilityFallback ? "Disponível" : "Escalado"}</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-purple-500" />Extra</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-red-500" />Contêm horários bloqueados</span>
        </div>
      </div>

      {/* Lista: minhas marcações */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          className="w-full px-4 py-3.5 flex items-center justify-between bg-gradient-to-r from-[#EEF4FF] to-[#F8FAFF] border-b border-gray-100"
          onClick={() => setShowMyAssignments(!showMyAssignments)}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🗓️</span>
            <span className="text-sm font-semibold text-[#1E3A6E]">
              {useAvailabilityFallback ? "Suas disponibilidades" : "Suas celebrações"}
            </span>
            {myAssignments.length > 0 && (
              <span className="bg-[#4A6FA5] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {myAssignments.length}
              </span>
            )}
          </div>
          <span className="text-gray-400 text-sm">{showMyAssignments ? "▲" : "▼"}</span>
        </button>

        {showMyAssignments && (
          <>
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
            ) : err ? (
              <div className="p-4 text-sm text-red-600">{err}</div>
            ) : myAssignments.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-2xl mb-2">📭</p>
                <p className="text-sm text-gray-500">
                  {useAvailabilityFallback
                    ? "Nenhuma disponibilidade registrada para este mês."
                    : "Nenhuma escala registrada para este mês."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {myAssignments.map((a, i) => {
                  const isTodayRow = a.date === todayIso;
                  return (
                    <div
                      key={`${a.date}-${a.time}-${i}`}
                      className={`flex items-center gap-3 px-4 py-3 ${isTodayRow ? "bg-green-50" : ""}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isTodayRow ? "bg-green-500" : "bg-[#EEF4FF]"
                      }`}>
                        <span className={`text-xs font-bold ${isTodayRow ? "text-white" : "text-[#4A6FA5]"}`}>
                          {a.date.split("-")[2]}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {a.title || (a.kind === "Fixa" ? "Missa" : a.kind === "Extra" ? "Missa Extra" : "Missa")}
                        </p>
                        <p className="text-xs text-gray-500">
                          {a.date.split("-").reverse().join("/")} · {a.time ? `${a.time.slice(0, 5)}h` : "—"}
                        </p>
                      </div>
                      {isTodayRow && (
                        <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                          Hoje
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>


      {/* Modal: detalhes do dia */}
      {selectedDate && (
        <div
          className="fixed inset-0 bg-black/30 flex items-start justify-center z-50 p-4"
          onClick={() => { setSelectedDate(null); setDayAssignments([]); }}
        >
          <div
            className="mt-20 w-full max-w-md bg-white rounded-xl shadow-lg border-2 border-gray-200 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#4A6FA5]">
                Escala do dia {selectedDate.split("-").reverse().join("/")}
              </h3>
              <button
                onClick={() => { setSelectedDate(null); setDayAssignments([]); }}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                Fechar
              </button>
            </div>

            {dayLoading ? (
              <div className="text-sm text-gray-500">Carregando informações...</div>
            ) : (
              (() => {
                const dayBlock = blockedMasses.find(b => b.date === selectedDate);
                const isBlockedDay = dayBlock && !dayBlock.blocked_times;

                if (isBlockedDay) {
                  return (
                    <div className="bg-red-50 border-2 border-red-300 rounded-lg text-red-700 p-4">
                      <p className="font-bold text-sm">O dia todo está bloqueado.</p>
                      <p className="text-sm mt-1">Motivo: {dayBlock.reason || 'Não especificado.'}</p>
                    </div>
                  );
                }

                let filteredAssignments = dayAssignments;

                if (useAvailabilityFallback && dayBlock && dayBlock.blocked_times && dayBlock.blocked_times.length > 0) {
                  filteredAssignments = dayAssignments.filter(assignment => {
                    const assignmentTimeHHMM = assignment.time.slice(0, 5);
                    const isBlocked = dayBlock.blocked_times!.some(blockedTime =>
                      blockedTime.slice(0, 5) === assignmentTimeHHMM
                    );
                    return !isBlocked;
                  });
                }

                if (filteredAssignments.length === 0) {
                  return (
                    <div className="text-sm text-gray-500 py-2">
                      {useAvailabilityFallback
                        ? "Nenhum horário disponível para marcação neste dia (pode ter sido bloqueado)."
                        : "Nenhum ministro escalado para este dia."}
                    </div>
                  );
                }

                // Horários bloqueados já são tratados na renderização abaixo
                // Não injetamos horários fantasma — só mostramos "Não haverá missa" 
                // para horários que realmente existem neste dia

                const grouped: Record<string, DayAssignment[]> = filteredAssignments.reduce(
                  (acc: Record<string, DayAssignment[]>, a) => {
                    const key = a.time || "";
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(a);
                    return acc;
                  }, {}
                );

                const times = Object.keys(grouped).sort();

                return (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {times.map((time) => {
                      const entries = grouped[time];
                      const normalize = (t: string) => t.slice(0, 5);
                      const assignmentTime = normalize(time);
                      const isBlockedTime =
                        dayBlock &&
                        Array.isArray(dayBlock.blocked_times) &&
                        dayBlock.blocked_times.some((bt) => normalize(bt) === assignmentTime);
                      const reason = dayBlock?.reason;

                      if (isBlockedTime) {
                        return (
                          <div key={time} className="border border-red-200 rounded-lg p-2.5 bg-red-50/50">
                            <div className="text-sm font-medium text-gray-600">{assignmentTime}h</div>
                            <div className="text-xs text-red-500 mt-0.5 italic">Não haverá missa{reason ? ` — ${reason}` : ""}</div>
                          </div>
                        );
                      }

                      return (
                        <div key={time} className="border-2 border-gray-100 rounded-lg p-3 last:border-b-2">
                          <div className="text-sm font-bold text-gray-800">
                            {entries[0].title ? (
                              <>
                                {assignmentTime}h –{" "}
                                <span className="text-purple-600">{entries[0].title}</span>
                              </>
                            ) : (
                              `${assignmentTime}h`
                            )}
                          </div>
                          <div className="mt-1 text-sm text-[#4A6FA5] leading-snug">
                            {Array.from(new Set(entries.map(e => e.ministerName)))
                              .filter(name => name)
                              .map((name, idx) => (
                                <span key={idx}>{idx > 0 && " · "}{name}</span>
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