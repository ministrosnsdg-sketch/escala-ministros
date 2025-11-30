import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

type Extra = {
  id: number;
  event_date: string;
  time: string;
  title: string;
  min_required: number;
  max_allowed: number;
  active: boolean;
  created_at: string;
};

export default function ExtrasPage() {
  return (
    <RequireAuth>
      <Layout>
        <ExtrasInner />
      </Layout>
    </RequireAuth>
  );
}

function ExtrasInner() {
  const { user } = useAuth();

  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("19:00");
  const [newMin, setNewMin] = useState(1);
  const [newMax, setNewMax] = useState(10);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editExtra, setEditExtra] = useState<Extra | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("19:00");
  const [editMin, setEditMin] = useState(1);
  const [editMax, setEditMax] = useState(10);
  const [editActive, setEditActive] = useState(true);

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
        .from("extras")
        .select("*")
        .order("event_date")
        .order("time");

      if (error) {
        setError("Erro ao carregar missas extras.");
        setLoading(false);
        return;
      }

      setExtras((data || []) as Extra[]);
      setLoading(false);
    };

    init();
  }, [user]);

  const refresh = async () => {
    const { data } = await supabase
      .from("extras")
      .select("*")
      .order("event_date")
      .order("time");
    if (data) setExtras(data as Extra[]);
  };

  const handleCreate = async () => {
    if (!isAdmin) return;

    if (!newTitle.trim() || !newDate || !newTime || newMin < 1 || newMax < newMin) {
      setError("Verifique os campos obrigatórios.");
      return;
    }

    setSaving(true);
    setError(null);

    await supabase.from("extras").insert({
      title: newTitle.trim(),
      event_date: newDate,
      time: newTime,
      min_required: newMin,
      max_allowed: newMax,
      active: true,
    });

    setSaving(false);
    setShowNewModal(false);
    setNewTitle("");
    setNewDate("");
    setNewTime("19:00");
    setNewMin(1);
    setNewMax(10);
    await refresh();
  };

  const openEdit = (e: Extra) => {
    setEditExtra(e);
    setEditTitle(e.title);
    setEditDate(e.event_date);
    setEditTime(e.time.slice(0, 5));
    setEditMin(e.min_required);
    setEditMax(e.max_allowed);
    setEditActive(e.active);
    setShowEditModal(true);
    setError(null);
  };

  const handleEditSave = async () => {
    if (!isAdmin || !editExtra) return;

    if (!editTitle.trim() || !editDate || !editTime || editMin < 1 || editMax < editMin) {
      setError("Verifique os campos obrigatórios.");
      return;
    }

    setSaving(true);
    setError(null);

    await supabase
      .from("extras")
      .update({
        title: editTitle.trim(),
        event_date: editDate,
        time: editTime,
        min_required: editMin,
        max_allowed: editMax,
        active: editActive,
      })
      .eq("id", editExtra.id);

    setSaving(false);
    setShowEditModal(false);
    setEditExtra(null);
    await refresh();
  };

  const handleDelete = async () => {
    if (!isAdmin || !editExtra) return;

    const confirmDelete = window.confirm("Deseja excluir esta missa extra?");
    if (!confirmDelete) return;

    setSaving(true);
    setError(null);

    await supabase.from("extras").delete().eq("id", editExtra.id);

    setSaving(false);
    setShowEditModal(false);
    setEditExtra(null);
    await refresh();
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <h2 className="text-lg font-semibold text-[#4A6FA5] mb-3">Missas Solenes</h2>
        <p className="text-sm text-gray-600">Carregando...</p>
      </div>
    );
  }

  const upcoming = extras;

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-lg font-semibold text-[#4A6FA5] mb-1">Missas Solenes</h2>
      <p className="text-[11px] text-gray-700 mb-3">
        Cadastre aqui celebrações de solenidade.
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
            Nova Missa Solene
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-[#D6E6F7] text-[10px] text-[#3F5F8F] font-semibold">
          Missas extras cadastradas
        </div>

        {upcoming.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-gray-500">
            Nenhuma missa extra cadastrada.
          </div>
        ) : (
          <table className="min-w-full text-[10px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left">Data</th>
                <th className="px-2 py-1 text-left">Horário</th>
                <th className="px-2 py-1 text-left">Título</th>
                <th className="px-2 py-1 text-center">Min</th>
                <th className="px-2 py-1 text-center">Max</th>
                <th className="px-2 py-1 text-center">Ativo</th>
                {isAdmin && <th className="px-2 py-1 text-center">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {upcoming.map((e) => {
                const date = new Date(e.event_date + "T00:00:00");
                return (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-2 py-1">{date.toLocaleDateString("pt-BR")}</td>
                    <td className="px-2 py-1">{e.time.slice(0, 5)}h</td>
                    <td className="px-2 py-1">{e.title}</td>
                    <td className="px-2 py-1 text-center">{e.min_required}</td>
                    <td className="px-2 py-1 text-center">{e.max_allowed}</td>
                    <td className="px-2 py-1 text-center">{e.active ? "Sim" : "Não"}</td>

                    {isAdmin && (
                      <td className="px-2 py-1 text-center">
                        <button
                          onClick={() => openEdit(e)}
                          className="px-2 py-0.5 border rounded text-[9px] hover:bg-gray-50"
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm border border-[#D6E6F7] p-4">
            <h3 className="text-sm font-semibold text-[#4A6FA5] mb-2">
              Nova Missa Solene
            </h3>

            <div className="space-y-2 mb-3">
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Título *</label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Data *</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Horário *</label>
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

      {showEditModal && editExtra && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm border border-[#D6E6F7] p-4">
            <h3 className="text-sm font-semibold text-[#4A6FA5] mb-2">
              Editar missa extra
            </h3>

            <div className="space-y-2 mb-3">
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Título *</label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Data *</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Horário *</label>
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
                    setEditExtra(null);
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
