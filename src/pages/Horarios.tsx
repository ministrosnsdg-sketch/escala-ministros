import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

type Horario = {
  id: number;
  weekday: number;
  time: string;
  min_required: number;
  max_allowed: number;
  active: boolean;
  created_at: string;
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

export default function HorariosPage() {
  return (
    <RequireAuth>
      <Layout>
        <HorariosInner />
      </Layout>
    </RequireAuth>
  );
}

function HorariosInner() {
  const { user } = useAuth();

  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newWeekday, setNewWeekday] = useState<number>(0);
  const [newTime, setNewTime] = useState<string>("07:00");
  const [newMin, setNewMin] = useState<number>(1);
  const [newMax, setNewMax] = useState<number>(4);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editHorario, setEditHorario] = useState<Horario | null>(null);
  const [editWeekday, setEditWeekday] = useState<number>(0);
  const [editTime, setEditTime] = useState<string>("07:00");
  const [editMin, setEditMin] = useState<number>(1);
  const [editMax, setEditMax] = useState<number>(4);
  const [editActive, setEditActive] = useState<boolean>(true);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);

      if (user) {
        const { data: me } = await supabase
          .from("ministers")
          .select("is_admin")
          .eq("user_id", user.id)
          .maybeSingle();
        if (me) setIsAdmin(!!me.is_admin);
      }

      const { data, error } = await supabase
        .from("horarios")
        .select("*")
        .order("weekday")
        .order("time");

      if (error) {
        setError("Não foi possível carregar os horários.");
        setLoading(false);
        return;
      }

      setHorarios((data || []) as Horario[]);
      setLoading(false);
    };

    init();
  }, [user]);

  const refresh = async () => {
    const { data } = await supabase
      .from("horarios")
      .select("*")
      .order("weekday")
      .order("time");
    if (data) setHorarios(data as Horario[]);
  };

  const handleCreate = async () => {
    if (!isAdmin) return;

    if (!newTime || newMin < 1 || newMax < newMin) {
      setError("Verifique os valores mínimo, máximo e horário.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("horarios").insert({
      weekday: newWeekday,
      time: newTime,
      min_required: newMin,
      max_allowed: newMax,
      active: true,
    });

    setSaving(false);

    if (error) {
      setError("Erro ao criar horário.");
      return;
    }

    setShowNewModal(false);
    setNewWeekday(0);
    setNewTime("07:00");
    setNewMin(1);
    setNewMax(4);
    await refresh();
  };

  const openEdit = (h: Horario) => {
    setEditHorario(h);
    setEditWeekday(h.weekday);
    setEditTime(h.time.slice(0, 5));
    setEditMin(h.min_required);
    setEditMax(h.max_allowed);
    setEditActive(h.active);
    setShowEditModal(true);
    setError(null);
  };

  const handleEditSave = async () => {
    if (!isAdmin || !editHorario) return;

    if (!editTime || editMin < 1 || editMax < editMin) {
      setError("Verifique os valores mínimo, máximo e horário.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("horarios")
      .update({
        weekday: editWeekday,
        time: editTime,
        min_required: editMin,
        max_allowed: editMax,
        active: editActive,
      })
      .eq("id", editHorario.id);

    setSaving(false);

    if (error) {
      setError("Erro ao salvar alterações.");
      return;
    }

    setShowEditModal(false);
    setEditHorario(null);
    await refresh();
  };

  const handleDelete = async () => {
    if (!isAdmin || !editHorario) return;

    const confirmDelete = window.confirm(
      "Tem certeza que deseja excluir este horário?"
    );
    if (!confirmDelete) return;

    setSaving(true);
    setError(null);

    await supabase.from("horarios").delete().eq("id", editHorario.id);

    setSaving(false);
    setShowEditModal(false);
    setEditHorario(null);
    await refresh();
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <h2 className="text-lg font-semibold text-[#4A6FA5] mb-3">
          Horários de Missa
        </h2>
        <p className="text-sm text-gray-600">Carregando horários...</p>
      </div>
    );
  }

  const grouped = WEEKDAYS.map((label, index) => ({
    label,
    items: horarios.filter((h) => h.weekday === index),
  }));

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-lg font-semibold text-[#4A6FA5] mb-1">
        Horários de Missa - Fixos
      </h2>
      <p className="text-[11px] text-gray-700 mb-3">
        Cadastre aqui os horários fixos de missa para cada dia da semana.
      </p>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => {
              setShowNewModal(true);
              setError(null);
            }}
            className="px-3 py-1.5 text-xs rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F]"
          >
            Novo horário
          </button>
        </div>
      )}

      <div className="space-y-3">
        {grouped.map((g) => (
          <div key={g.label} className="bg-white border border-gray-200 rounded-lg">
            <div className="px-3 py-1.5 bg-[#D6E6F7] text-[10px] text-[#3F5F8F] font-semibold flex justify-between">
              <span>{g.label}</span>
              <span>{g.items.length} horário(s)</span>
            </div>
            {g.items.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-gray-500">
                Nenhum horário cadastrado.
              </div>
            ) : (
              <table className="w-full text-[10px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left">Horário</th>
                    <th className="px-2 py-1 text-center">Mínimo</th>
                    <th className="px-2 py-1 text-center">Máximo</th>
                    <th className="px-2 py-1 text-center">Ativo</th>
                    {isAdmin && (
                      <th className="px-2 py-1 text-center">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((h) => (
                    <tr key={h.id} className="border-t border-gray-100">
                      <td className="px-2 py-1">{h.time.slice(0, 5)}h</td>
                      <td className="px-2 py-1 text-center">
                        {h.min_required}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {h.max_allowed}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {h.active ? "Sim" : "Não"}
                      </td>
                      {isAdmin && (
                        <td className="px-2 py-1 text-center">
                          <button
                            onClick={() => openEdit(h)}
                            className="px-2 py-0.5 border rounded text-[9px] hover:bg-gray-50"
                          >
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm border border-[#D6E6F7] p-4">
            <h3 className="text-sm font-semibold text-[#4A6FA5] mb-2">
              Novo horário fixo
            </h3>
            <div className="space-y-2 mb-3">
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Dia da semana
                </label>
                <select
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newWeekday}
                  onChange={(e) => setNewWeekday(Number(e.target.value))}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Horário
                </label>
                <input
                  type="time"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-600 mb-1">
                    Mínimo
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={newMin}
                    onChange={(e) => {
                      const n = e.target.value.replace(/\D/g, "");
                      setNewMin(n === "" ? 0 : Number(n));
                    }}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-600 mb-1">
                    Máximo
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={newMax}
                    onChange={(e) => {
                      const n = e.target.value.replace(/\D/g, "");
                      setNewMax(n === "" ? 0 : Number(n));
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1 text-[10px] rounded border border-gray-300 hover:bg-gray-50"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                className="px-3 py-1 text-[10px] rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F] disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editHorario && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm border border-[#D6E6F7] p-4">
            <h3 className="text-sm font-semibold text-[#4A6FA5] mb-2">
              Editar horário
            </h3>
            <div className="space-y-2 mb-3">
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Dia da semana
                </label>
                <select
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editWeekday}
                  onChange={(e) =>
                    setEditWeekday(Number(e.target.value))
                  }
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-gray-600 mb-1">
                  Horário
                </label>
                <input
                  type="time"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-600 mb-1">
                    Mínimo
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={editMin}
                    onChange={(e) => {
                      const n = e.target.value.replace(/\D/g, "");
                      setEditMin(n === "" ? 0 : Number(n));
                    }}
                  />
                </div>

                <div className="flex-1">
                  <label className="block text-[10px] text-gray-600 mb-1">
                    Máximo
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={editMax}
                    onChange={(e) => {
                      const n = e.target.value.replace(/\D/g, "");
                      setEditMax(n === "" ? 0 : Number(n));
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-1 text-[10px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                  Ativo
                </label>
              </div>
            </div>

            <div className="flex justify-between items-center gap-2">
              <button
                onClick={handleDelete}
                className="px-2 py-1 text-[9px] rounded border border-red-300 text-red-600 hover:bg-red-50"
                disabled={saving}
              >
                Excluir
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditHorario(null);
                  }}
                  className="px-3 py-1 text-[10px] rounded border border-gray-300 hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  onClick={handleEditSave}
                  className="px-3 py-1 text-[10px] rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F] disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
