import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const MONTHS = [
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

type Horario = {
  time: string;
  weekday: number;
  active: boolean;
};

type Extra = {
  time: string;
  date: string;
  active: boolean;
};

type Blocked = {
  id: number;
  date: string;
  blocked_times: string[] | null;
  reason: string | null;
};

export default function BloqueiosDeMissas() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [blocks, setBlocks] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState("");
  const [modalReason, setModalReason] = useState("");
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  // LOAD MONTH BLOCKS
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

  function formatHour(time: string) {
    return time.substring(0, 5);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR");
  }

  // OPEN / EDIT MODAL
  function openNewBlock() {
    setEditingId(null);
    setModalDate("");
    setModalReason("");
    setAvailableTimes([]);
    setSelectedTimes([]);
    setModalOpen(true);
  }

  async function openEditBlock(item: Blocked) {
    setEditingId(item.id);
    setModalDate(item.date);
    setModalReason(item.reason ?? "");

    await loadTimesForDate(item.date);
    setSelectedTimes(item.blocked_times ?? []);

    setModalOpen(true);
  }

  // LOAD TIMES FOR SELECTED DATE
  async function loadTimesForDate(date: string) {
    if (!date) {
      setAvailableTimes([]);
      return;
    }

    const d = new Date(date);
    const weekday = d.getDay();

    // FIXED TIMES
    const { data: hData } = await supabase
      .from("horarios")
      .select("*")
      .eq("weekday", weekday)
      .eq("active", true)
      .order("time");

    const fixedTimes = (hData ?? []).map((h: Horario) => h.time);

    // EXTRA TIMES
    const { data: eData } = await supabase
  .from("extras")
  .select("*")
  .eq("event_date", date)
  .eq("active", true)
  .order("time");

    const extraTimes = (eData ?? []).map((e: any) => e.time);

    setAvailableTimes([...fixedTimes, ...extraTimes]);
  }

  async function handleDateChange(value: string) {
    setModalDate(value);
    setSelectedTimes([]);
    await loadTimesForDate(value);
  }

  // SAVE BLOCK
  async function saveBlock() {
    if (!modalDate) {
      alert("Selecione uma data.");
      return;
    }

    const payload = {
      date: modalDate,
      blocked_times: selectedTimes.length ? selectedTimes : null,
      reason: modalReason || null,
    };

    let resp;
    if (editingId) {
      resp = await supabase.from("blocked_masses").update(payload).eq("id", editingId);
    } else {
      resp = await supabase.from("blocked_masses").insert(payload);
    }

    if (resp.error) {
      alert("Erro ao salvar bloqueio.");
      return;
    }

    setModalOpen(false);
    loadBlocks();
  }

  // REMOVE BLOCK
  async function removeBlock(id: number) {
    if (!confirm("Excluir bloqueio?")) return;

    const { error } = await supabase.from("blocked_masses").delete().eq("id", id);
    if (error) {
      alert("Erro ao excluir");
      return;
    }

    loadBlocks();
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-[#4A6FA5]">Bloqueios de Missas</h2>

      {/* Filters */}
      <div className="flex gap-2 items-center text-[10px]">
        <select
          className="border rounded px-2 py-1"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>
              {m}
            </option>
          ))}
        </select>

        <select
          className="border rounded px-2 py-1"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {Array.from({ length: 6 }).map((_, i) => {
            const y = today.getFullYear() - 2 + i;
            return (
              <option key={i} value={y}>
                {y}
              </option>
            );
          })}
        </select>

        <button
          onClick={openNewBlock}
          className="px-3 py-1.5 bg-[#4A6FA5] text-white rounded text-[10px] hover:bg-[#3F5F8F]"
        >
          Novo Bloqueio
        </button>
      </div>

      {/* LISTA DE BLOQUEIOS EXISTENTES */}
<div className="space-y-3 mt-4">
  <h3 className="text-[12px] font-semibold text-[#4A6FA5]">
    Bloqueios aplicados neste mês
  </h3>

  {loading && (
    <p className="text-[10px] text-gray-600">Carregando…</p>
  )}

  {!loading && blocks.length === 0 && (
    <p className="text-[11px] text-gray-600 italic">
      Nenhum bloqueio aplicado neste mês.
    </p>
  )}

  {!loading &&
    blocks.length > 0 &&
    blocks.map((b) => (
      <div
        key={b.id}
        className="border rounded-xl bg-white p-3 text-[11px] shadow-sm"
      >
        <div className="flex justify-between items-center mb-1">
          <p className="font-semibold text-[12px] text-[#4A6FA5]">
            {formatDate(b.date)}
          </p>

          <div className="flex gap-2">
            <button
              className="px-2 py-0.5 bg-gray-200 rounded text-[10px]"
              onClick={() => openEditBlock(b)}
            >
              Editar
            </button>

            <button
              className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px]"
              onClick={() => removeBlock(b.id)}
            >
              Excluir
            </button>
          </div>
        </div>

        {(b.blocked_times ?? []).length > 0 ? (
          b.blocked_times.map((t) => (
            <div key={t} className="ml-1">
              <span className="font-medium">{formatHour(t)}</span>{" "}
              — <span className="text-red-600 font-semibold">Bloqueado</span>
            </div>
          ))
        ) : (
          <p className="text-[10px] italic text-gray-500">
            Dia bloqueado sem horários específicos.
          </p>
        )}

        {b.reason && (
          <p className="text-[10px] text-gray-500 italic mt-1">
            Motivo: {b.reason}
          </p>
        )}
      </div>
    ))}
</div>


      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center p-4">
          <div className="bg-white p-5 rounded shadow-md w-full max-w-sm text-[11px]">
            <h3 className="text-[13px] font-semibold mb-3 text-[#4A6FA5]">
              {editingId ? "Editar Bloqueio" : "Novo Bloqueio"}
            </h3>

            {/* Data */}
            <label className="block mb-1 font-medium">Data</label>
            <input
              type="date"
              value={modalDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="border rounded px-2 py-1 w-full mb-3"
            />

            {/* Horários */}
            <label className="block mb-1 font-medium">Horários bloqueados</label>

            {availableTimes.length === 0 ? (
              <p className="text-gray-500 mb-2">Nenhum horário encontrado.</p>
            ) : (
              <div className="space-y-1 mb-3">
                {availableTimes.map((t) => (
                  <label key={t} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedTimes.includes(t)}
                      onChange={() => {
                        if (selectedTimes.includes(t)) {
                          setSelectedTimes(selectedTimes.filter((x) => x !== t));
                        } else {
                          setSelectedTimes([...selectedTimes, t]);
                        }
                      }}
                    />
                    {formatHour(t)}
                  </label>
                ))}
              </div>
            )}

            {/* Motivo */}
            <label className="block mb-1 font-medium">Motivo (opcional)</label>
            <input
              value={modalReason}
              onChange={(e) => setModalReason(e.target.value)}
              className="border rounded px-2 py-1 w-full mb-4"
              placeholder="Ex: Feriado, Retiro..."
            />

            <div className="flex justify-end gap-2 mt-3">
              <button
                className="px-3 py-1 bg-gray-300 rounded text-[10px]"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>

              <button
                className="px-3 py-1 bg-blue-600 text-white rounded text-[10px]"
                onClick={saveBlock}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}