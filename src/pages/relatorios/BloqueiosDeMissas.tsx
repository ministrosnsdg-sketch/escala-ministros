import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAYS_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAYS_FULL = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado",
];

type Horario = {
  id: number;
  time: string;
  weekday: number;
  active: boolean;
};

type Blocked = {
  id: number;
  date: string;
  blocked_times: string[] | null;
  reason: string | null;
};

function formatHour(time: string) {
  return time.substring(0, 5);
}

function formatDateBR(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function BloqueiosDeMissas() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [blocks, setBlocks] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Calendário
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Horários do dia selecionado (apenas missas comuns)
  const [dayTimes, setDayTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);

  // Estado de bloqueio por horário individual
  const [timeBlockState, setTimeBlockState] = useState<Record<string, { blocked: boolean; reason: string }>>({});

  // Bloqueios do mês para marcar no calendário
  const blockedDatesMap = useMemo(() => {
    const map = new Map<string, Blocked>();
    blocks.forEach(b => map.set(b.date, b));
    return map;
  }, [blocks]);

  // Matriz do calendário
  const daysMatrix = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const firstWeekday = first.getDay();
    const daysInMonth = last.getDate();
    const matrix: { day: number | null; date: string | null }[][] = [];
    let currentDay = 1;
    let done = false;
    while (!done) {
      const week: { day: number | null; date: string | null }[] = [];
      for (let i = 0; i < 7; i++) {
        if ((matrix.length === 0 && i < firstWeekday) || currentDay > daysInMonth) {
          week.push({ day: null, date: null });
        } else {
          const d = new Date(year, month, currentDay);
          week.push({ day: currentDay, date: isoDate(d) });
          currentDay++;
        }
      }
      matrix.push(week);
      if (currentDay > daysInMonth) done = true;
    }
    return matrix;
  }, [year, month]);

  // CARREGAR BLOQUEIOS DO MÊS
  useEffect(() => {
    loadBlocks();
  }, [month, year]);

  async function loadBlocks() {
    setLoading(true);
    const start = new Date(year, month, 1).toISOString().slice(0, 10);
    const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("blocked_masses")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true });
    if (!error && data) setBlocks(data);
    setLoading(false);
  }

  // CARREGAR HORÁRIOS AO SELECIONAR DATA
  useEffect(() => {
    if (!selectedDate) {
      setDayTimes([]);
      setTimeBlockState({});
      return;
    }
    loadDayTimes(selectedDate);
  }, [selectedDate, blocks]);

  async function loadDayTimes(date: string) {
    setLoadingTimes(true);
    const d = new Date(date + "T00:00:00");
    const weekday = d.getDay();

    // Apenas missas comuns — NUNCA missas solenes
    const { data: hData } = await supabase
      .from("horarios")
      .select("id, time, weekday, active")
      .eq("weekday", weekday)
      .eq("active", true)
      .order("time");

    const times = (hData ?? []).map((h: Horario) => h.time);
    setDayTimes(times);

    // Verificar quais já estão bloqueados
    const existing = blockedDatesMap.get(date);
    const state: Record<string, { blocked: boolean; reason: string }> = {};
    times.forEach(t => {
      const isBlocked = existing
        ? existing.blocked_times === null || (existing.blocked_times ?? []).includes(t)
        : false;
      state[t] = {
        blocked: isBlocked,
        reason: isBlocked && existing?.reason ? existing.reason : "",
      };
    });
    setTimeBlockState(state);
    setLoadingTimes(false);
  }

  // TOGGLE INDIVIDUAL POR HORÁRIO
  function toggleTime(time: string) {
    setTimeBlockState(prev => ({
      ...prev,
      [time]: { ...prev[time], blocked: !prev[time].blocked },
    }));
  }

  function setTimeReason(time: string, reason: string) {
    setTimeBlockState(prev => ({
      ...prev,
      [time]: { ...prev[time], reason },
    }));
  }

  // SALVAR BLOQUEIOS DO DIA
  async function saveDayBlocks() {
    if (!selectedDate) return;
    setSaving(true);
    setFeedback(null);

    const blockedTimes = Object.entries(timeBlockState)
      .filter(([_, v]) => v.blocked)
      .map(([t]) => t);

    const reasons = Object.values(timeBlockState).filter(v => v.blocked && v.reason.trim());
    const mainReason = reasons.length > 0 ? reasons[0].reason.trim() : null;

    const existing = blockedDatesMap.get(selectedDate);

    if (blockedTimes.length === 0) {
      if (existing) {
        await supabase.from("blocked_masses").delete().eq("id", existing.id);
      }
      setSaving(false);
      setFeedback({ type: "ok", msg: "Bloqueios removidos para este dia." });
      await loadBlocks();
      return;
    }

    const payload = {
      date: selectedDate,
      blocked_times: blockedTimes,
      reason: mainReason,
    };

    let resp;
    if (existing) {
      resp = await supabase.from("blocked_masses").update(payload).eq("id", existing.id);
    } else {
      resp = await supabase.from("blocked_masses").insert(payload);
    }

    if (resp.error) {
      setSaving(false);
      setFeedback({ type: "err", msg: "Erro ao salvar bloqueio." });
      return;
    }

    // AUTO-REMOVER DISPONIBILIDADES DOS MINISTROS para horários bloqueados
    const d = new Date(selectedDate + "T00:00:00");
    const weekday = d.getDay();

    const { data: horariosData } = await supabase
      .from("horarios")
      .select("id, time")
      .eq("weekday", weekday)
      .eq("active", true);

    const blockedHorarioIds = (horariosData ?? [])
      .filter((h: any) => blockedTimes.includes(h.time))
      .map((h: any) => h.id);

    if (blockedHorarioIds.length > 0) {
      await supabase
        .from("monthly_availability_regular")
        .delete()
        .eq("date", selectedDate)
        .in("horario_id", blockedHorarioIds);

      await supabase
        .from("escala_regular")
        .delete()
        .eq("date", selectedDate)
        .in("horario_id", blockedHorarioIds);
    }

    setSaving(false);
    setFeedback({ type: "ok", msg: `${blockedTimes.length} horário(s) bloqueado(s) com sucesso.` });
    await loadBlocks();
  }

  // REMOVER BLOQUEIO DO DIA
  async function removeAllBlocks() {
    if (!selectedDate) return;
    const existing = blockedDatesMap.get(selectedDate);
    if (!existing) return;
    if (!confirm("Remover todos os bloqueios deste dia?")) return;

    await supabase.from("blocked_masses").delete().eq("id", existing.id);
    setTimeBlockState(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { blocked: false, reason: "" }; });
      return next;
    });
    setFeedback({ type: "ok", msg: "Todos os bloqueios foram removidos." });
    await loadBlocks();
  }

  const selectedDateWeekday = selectedDate
    ? WEEKDAYS_FULL[new Date(selectedDate + "T00:00:00").getDay()]
    : "";
  const selectedDateBlock = selectedDate ? blockedDatesMap.get(selectedDate) : null;
  const anyBlocked = Object.values(timeBlockState).some(v => v.blocked);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#1E3A6E]">Bloqueios de Missas</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Bloqueie horários de missas comuns. Missas solenes nunca são afetadas.
        </p>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`text-sm px-4 py-3 rounded-2xl flex items-center gap-2 ${
          feedback.type === "ok"
            ? "text-green-700 bg-green-50 border-2 border-green-200"
            : "text-red-600 bg-red-50 border-2 border-red-200"
        }`}>
          <span>{feedback.type === "ok" ? "✅" : "⚠️"}</span>{feedback.msg}
        </div>
      )}

      {/* Seletor mês/ano */}
      <div className="flex gap-1.5">
        <select
          className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-medium bg-white focus:border-[#4A6FA5] focus:outline-none"
          value={month}
          onChange={(e) => { setMonth(Number(e.target.value)); setSelectedDate(null); setFeedback(null); }}
        >
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select
          className="w-24 border-2 border-gray-200 rounded-xl px-2 py-2 text-sm font-medium bg-white focus:border-[#4A6FA5] focus:outline-none"
          value={year}
          onChange={(e) => { setYear(Number(e.target.value)); setSelectedDate(null); setFeedback(null); }}
        >
          {Array.from({ length: 6 }).map((_, i) => {
            const y = today.getFullYear() - 2 + i;
            return <option key={i} value={y}>{y}</option>;
          })}
        </select>
      </div>

      {/* CALENDÁRIO */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-[#1E3A6E] to-[#4A6FA5] px-4 py-3">
          <p className="text-white text-sm font-bold text-center">{MONTHS[month]} {year}</p>
          <div className="grid grid-cols-7 text-center mt-2">
            {WEEKDAYS_SHORT.map((w, i) => (
              <div key={i} className={`text-xs font-bold ${i === 0 ? "text-red-300" : "text-blue-200"}`}>{w}</div>
            ))}
          </div>
        </div>

        <div className="p-2">
          <div className="grid grid-cols-7 gap-1">
            {daysMatrix.map((week, wi) =>
              week.map((cell, ci) => {
                if (!cell.date || cell.day === null) {
                  return <div key={`${wi}-${ci}`} className="h-11 rounded-xl" />;
                }
                const date = cell.date;
                const block = blockedDatesMap.get(date);
                const hasBlock = !!block;
                const blockCount = block?.blocked_times?.length ?? 0;
                const isFullDay = block && block.blocked_times === null;
                const isSelected = selectedDate === date;

                return (
                  <button
                    key={date}
                    onClick={() => { setSelectedDate(isSelected ? null : date); setFeedback(null); }}
                    className={`h-11 rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 ${
                      isSelected
                        ? "bg-[#4A6FA5] shadow-md shadow-blue-200 ring-2 ring-[#4A6FA5] ring-offset-1"
                        : hasBlock
                        ? "bg-red-50 border-2 border-red-300"
                        : "bg-gray-50 border border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    <span className={`text-sm font-bold leading-none ${
                      isSelected ? "text-white" : hasBlock ? "text-red-700" : "text-gray-700"
                    }`}>{cell.day}</span>
                    {hasBlock && !isSelected && (
                      <span className="text-[8px] text-red-500 font-bold mt-0.5">
                        {isFullDay ? "DIA" : `${blockCount}h`}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-red-400" />Contém bloqueios
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-[#4A6FA5]" />Selecionado
          </span>
        </div>
      </div>

      {/* PAINEL DO DIA SELECIONADO */}
      {selectedDate && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-red-50 to-white border-b border-red-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1E3A6E]">
                  {selectedDateWeekday} — {formatDateBR(selectedDate)}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Selecione os horários de missas comuns para bloquear
                </p>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm font-bold"
              >
                ×
              </button>
            </div>
          </div>

          <div className="p-4 space-y-2">
            {loadingTimes ? (
              <p className="text-sm text-gray-500 py-4 text-center">Carregando horários...</p>
            ) : dayTimes.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <p className="text-2xl mb-2">📅</p>
                <p className="text-sm">Nenhuma missa comum neste dia da semana.</p>
              </div>
            ) : (
              <>
                {/* Info */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                  ⛪ Apenas missas comuns. Missas solenes nunca são bloqueadas.
                </div>

                {/* Cards de horário */}
                {dayTimes.map(t => {
                  const state = timeBlockState[t];
                  if (!state) return null;
                  const isBlocked = state.blocked;

                  return (
                    <div
                      key={t}
                      className={`rounded-2xl border-2 transition-all ${
                        isBlocked ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <button
                          onClick={() => toggleTime(t)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                            isBlocked ? "bg-red-500" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                              isBlocked ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold ${isBlocked ? "text-red-700" : "text-gray-700"}`}>
                            {formatHour(t)}h
                          </p>
                          <p className={`text-xs ${isBlocked ? "text-red-500" : "text-gray-400"}`}>
                            {isBlocked ? "Missa bloqueada" : "Missa normal"}
                          </p>
                        </div>

                        <span className={`text-lg ${isBlocked ? "" : "opacity-30"}`}>
                          {isBlocked ? "🚫" : "✅"}
                        </span>
                      </div>

                      {isBlocked && (
                        <div className="px-3 pb-3 pt-0">
                          <input
                            value={state.reason}
                            onChange={(e) => setTimeReason(t, e.target.value)}
                            className="w-full border border-red-200 rounded-xl px-3 py-2 text-xs bg-white focus:border-red-400 focus:outline-none"
                            placeholder="Motivo (opcional): Ex: Feriado, Retiro..."
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Ações */}
                <div className="flex gap-2 pt-2">
                  {selectedDateBlock && (
                    <button
                      onClick={removeAllBlocks}
                      className="flex-1 py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
                    >
                      Remover todos
                    </button>
                  )}
                  <button
                    onClick={saveDayBlocks}
                    disabled={saving}
                    className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all active:scale-95 ${
                      anyBlocked
                        ? "bg-gradient-to-r from-red-500 to-red-600 shadow-md shadow-red-100"
                        : "bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] shadow-md shadow-blue-100"
                    } disabled:opacity-50`}
                  >
                    {saving ? "Salvando..." : anyBlocked ? "Salvar bloqueios" : "Salvar (sem bloqueios)"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* LISTA RESUMO DOS BLOQUEIOS DO MÊS */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1E3A6E]">Bloqueios em {MONTHS[month]}</h3>
          <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">
            {blocks.length}
          </span>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500 text-center">Carregando...</div>
        ) : blocks.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-2xl mb-2">🟢</p>
            <p className="text-sm text-gray-500">Nenhum bloqueio neste mês.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {blocks.map(b => {
              const wd = WEEKDAYS_FULL[new Date(b.date + "T00:00:00").getDay()];
              return (
                <button
                  key={b.id}
                  onClick={() => { setSelectedDate(b.date); setFeedback(null); }}
                  className="w-full text-left px-4 py-3 hover:bg-red-50/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {formatDateBR(b.date)} · {wd}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(b.blocked_times ?? []).length > 0 ? (
                          b.blocked_times!.map(t => (
                            <span key={t} className="inline-flex items-center bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                              🚫 {formatHour(t)}h
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-red-500 italic">Dia inteiro bloqueado</span>
                        )}
                      </div>
                      {b.reason && (
                        <p className="text-xs text-gray-400 mt-1 italic">{b.reason}</p>
                      )}
                    </div>
                    <span className="text-gray-300 text-sm ml-2">›</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
