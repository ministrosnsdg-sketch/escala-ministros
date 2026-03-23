// src/pages/Ministros.tsx
import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

type Minister = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  is_admin: boolean;
  active: boolean;
  must_reset_password: boolean;
  created_at: string;
};

export default function MinistrosPage() {
  return (
    <RequireAuth>
      <Layout>
        <MinistrosAdmin />
      </Layout>
    </RequireAuth>
  );
}

function MinistrosAdmin() {
  const SUPERADMIN_EMAIL = "admin@paroquia.com";
  const { user } = useAuth();

  const [ministers, setMinisters] = useState<Minister[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const superadmin = ministers.find(m => m.email === SUPERADMIN_EMAIL);

  // Novo ministro modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBirthDate, setNewBirthDate] = useState("");

  // Editar ministro modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editMinister, setEditMinister] = useState<Minister | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editActive, setEditActive] = useState(true);

  // --- Contadores de ministros ---
const totalAtivos = ministers.filter(m => m.active).length;
const totalInativos = ministers.filter(m => !m.active).length;


  // Carrega ministros + descobre se usuário atual é admin
  useEffect(() => {
    const fetchMinisters = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("ministers")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        console.error(error);
        setError("Não foi possível carregar os ministros.");
        setLoading(false);
        return;
      }

      const list = (data || []) as Minister[];
      setMinisters(list);
      if (!user) { setIsAdmin(false); return; }
      if (user) {
        const me = list.find(
          (m) => m.user_id === user.id || m.email === user.email
        );
        setIsAdmin(!!me?.is_admin);
      } else {
        setIsAdmin(false);
      }

      setLoading(false);
    };

    fetchMinisters();
  }, [user]);

  const refresh = async () => {
    const { data, error } = await supabase
      .from("ministers")
      .select("*")
      .order("name", { ascending: true });

    if (!error && data) {
      const list = data as Minister[];
      setMinisters(list);
      if (user) {
        const me = list.find(
          (m) => m.user_id === user.id || m.email === user.email
        );
        setIsAdmin(!!me?.is_admin);
      }
    }
  };

  // ---------------- NOVO MINISTRO (Edge Function create-minister) ----------------

  const handleCreate = async () => {
    if (!isAdmin) return;

    setError(null);

    if (!newName.trim() || !newEmail.trim()) {
      setError("Nome e e-mail são obrigatórios.");
      return;
    }

    if (!newBirthDate) {
      setError("A data de aniversário é obrigatória.");
      return;
    }
// força e-mail minúsculo
const normalizedEmail = newEmail.trim().toLowerCase();

// bloqueia e-mail duplicado antes de chamar a edge function
const { data: existing } = await supabase
  .from("ministers")
  .select("id")
  .eq("email", normalizedEmail)
  .maybeSingle();

if (existing) {
  setError("Este e-mail já está cadastrado.");
  return;
}

    setSaving(true);

    const { data, error } = await supabase.functions.invoke("create-minister", {
      body: {
        name: newName.trim(),
        email: normalizedEmail,
        phone: newPhone.trim() || null,
        birth_date: newBirthDate || null,
      },
    });

    setSaving(false);

    if (error || (data && (data as any).error)) {
      console.error(error || (data as any).error);
      setError(
        (data as any)?.error ||
          "Erro ao criar ministro. Verifique se o e-mail já não está em uso."
      );
      return;
    }

    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewBirthDate("");
    setShowNewModal(false);
    await refresh();
  };

  // ---------------- EDITAR MINISTRO ----------------

  const openEdit = (m: Minister) => {
  // SUPERADMIN não pode ser editado
  if (m.email === SUPERADMIN_EMAIL) return;

  setEditMinister(m);
  setEditName(m.name);
  setEditEmail(m.email || "");
  setEditPhone(m.phone || "");
  setEditBirthDate(m.birth_date || "");
  setEditIsAdmin(m.is_admin);
  setEditActive(m.active);
  setShowEditModal(true);
  setError(null);
};

  const handleEditSave = async () => {
    if (!isAdmin || !editMinister) return;

    if (!editName.trim() || !editEmail.trim()) {
      setError("Nome e e-mail são obrigatórios.");
      return;
    }

    if (!editBirthDate) {
      setError("A data de aniversário é obrigatória.");
      return;
    }
// força e-mail minúsculo
const normalizedEmail = editEmail.trim().toLowerCase();

// impede duplicação (exceto ele mesmo)
const { data: exists } = await supabase
  .from("ministers")
  .select("id")
  .eq("email", normalizedEmail)
  .neq("id", editMinister.id)
  .maybeSingle();

if (exists) {
  setError("Outro ministro já está usando este e-mail.");
  return;
}

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("ministers")
      .update({
        name: editName.trim(),
        email: normalizedEmail,
        phone: editPhone.trim() || null,
        birth_date: editBirthDate || null,
        is_admin: editIsAdmin,
        active: editActive,
      })
      .eq("id", editMinister.id);

    setSaving(false);

    if (error) {
      console.error(error);
      setError("Erro ao salvar alterações do ministro.");
      return;
    }

    setShowEditModal(false);
    setEditMinister(null);
    await refresh();
  };

  // ---------------- EXCLUIR MINISTRO (Edge Function delete-minister) ----------------

  const handleDelete = async () => {
  if (!isAdmin || !editMinister) return;

  // SUPERADMIN nunca pode ser excluído
  if (editMinister.email === SUPERADMIN_EMAIL) {
    setError("Este ministro não pode ser excluído.");
    return;
  }

  const ok = window.confirm(
    "Tem certeza que deseja excluir este ministro? Isso também pode remover o acesso de login vinculado."
  );
  if (!ok) return;

  setSaving(true);
  setError(null);

  const { data, error } = await supabase.functions.invoke("delete-minister", {
    body: { ministerId: editMinister.id },
  });

  setSaving(false);

  if (error || (data && (data as any).error)) {
    console.error(error || (data as any).error);
    setError(
      (data as any)?.error ||
        "Erro ao excluir ministro. Verifique se a função delete-minister está configurada."
    );
    return;
  }

  setShowEditModal(false);
  setEditMinister(null);
  await refresh();
};

  // ---------------- RENDER ----------------

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-xl font-bold mb-3 text-[#4A6FA5]">
          Ministros
        </h2>
        <p className="text-sm text-gray-600">Carregando ministros...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xl font-bold mb-3 text-[#4A6FA5]">
          Ministros
        </h2>
        <p className="text-sm text-gray-700">
          Esta área é restrita à coordenação. Caso você seja ministro e precise
          atualizar seus dados, procure a coordenação ou a secretaria paroquial.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-xl font-bold text-[#1E3A6E] mb-1">Ministros</h2>
      <p className="text-sm text-gray-500 mb-4">Gerencie os ministros cadastrados.</p>
            {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gradient-to-br from-[#EEF4FF] to-white border border-[#D6E6F7] rounded-2xl p-3 text-center">
          <p className="text-2xl font-bold text-[#4A6FA5]">{totalAtivos}</p>
          <p className="text-xs text-gray-500 mt-0.5">Ativos</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-white border border-red-100 rounded-2xl p-3 text-center">
          <p className="text-2xl font-bold text-red-500">{totalInativos}</p>
          <p className="text-xs text-gray-500 mt-0.5">Inativos</p>
        </div>
      </div>


      <p className="text-sm text-gray-600 mb-3">
        Ao cadastrar um novo ministro, o sistema cria automaticamente o usuário
        com senha inicial <strong>123456</strong> e marca para redefinir no
        primeiro login.
      </p>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border-2 border-red-200 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      <div className="flex gap-2 mb-4">
        <input type="text" placeholder="Buscar ministro..." className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-[#4A6FA5] focus:outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <button onClick={() => { setShowNewModal(true); setError(null); }} className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] text-white text-sm font-bold flex-shrink-0">
          + Novo
        </button>
      </div>

      <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-[#1E3A6E] to-[#4A6FA5] text-white text-xs">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">Nome</th>
              <th className="px-3 py-3 text-left font-semibold hidden sm:table-cell">E-mail</th>
              <th className="px-3 py-3 text-center font-semibold">Admin</th>
              <th className="px-3 py-3 text-center font-semibold">Ativo</th>
              <th className="px-3 py-3 text-center font-semibold">1º acesso</th>
              <th className="px-3 py-3 text-center font-semibold">Ação</th>
            </tr>
          </thead>
          <tbody>
            {ministers
  .filter(m => 
    m.email !== SUPERADMIN_EMAIL &&
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  )
  .map((m) => (
              <tr
                key={m.id}
                className={
                  "border-t border-gray-100 " +
                  (!m.active ? "bg-gray-50 text-gray-400" : "")
                }
              >
                <td className="px-3 py-2.5 font-medium text-gray-800">{m.name}</td>
                <td className="px-3 py-2.5 text-gray-500 text-xs hidden sm:table-cell">{m.email || "-"}</td>
                <td className="px-3 py-2.5 text-center text-xs">
                  {m.is_admin ? <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">Sim</span> : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {m.active ? <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Ativo</span> : <span className="text-xs bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">Inativo</span>}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {m.must_reset_password ? <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">Pendente</span> : <span className="text-xs text-gray-400">OK</span>}
                </td>
                <td className="px-2 py-1 text-center">
                  {/* EDITAR – só aparece se não for o superadmin */}
{m.email !== SUPERADMIN_EMAIL && (
  <button
    onClick={() => openEdit(m)}
    className="px-3 py-1 border-2 rounded-lg text-xs font-medium hover:bg-gray-50"
  >
    Editar
  </button>
)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>


      {/* Modal: Novo Ministro */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 p-5">
            <h3 className="text-base font-bold text-[#1E3A6E] mb-4">
              Novo Ministro
            </h3>
            <div className="space-y-2 mb-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Nome completo *
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  E-mail *
                </label>
                <input
                  type="email"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Data de aniversário *
                </label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newBirthDate}
                  onChange={(e) => setNewBirthDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Telefone (opcional)
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setNewName("");
                  setNewEmail("");
                  setNewPhone("");
                  setNewBirthDate("");
                }}
                className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                className="px-3 py-1 text-sm rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F] disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Criando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Ministro */}
      {showEditModal && editMinister && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 p-5">
            <h3 className="text-base font-bold text-[#1E3A6E] mb-4">
              Editar Ministro
            </h3>
            <div className="space-y-2 mb-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Nome completo *
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  E-mail *
                </label>
                <input
                  type="email"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Data de aniversário *
                </label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editBirthDate}
                  onChange={(e) => setEditBirthDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Telefone
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-3 mt-2">
                <label className="flex items-center gap-1 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={editIsAdmin}
                    onChange={(e) => setEditIsAdmin(e.target.checked)}
                  />
                  Administrador
                </label>
                <label className="flex items-center gap-1 text-sm text-gray-700">
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
              {/* SUPERADMIN não mostra botão excluir */}
{editMinister?.email !== SUPERADMIN_EMAIL && (
  <button
    onClick={handleDelete}
    className="px-3 py-2 text-sm rounded-lg border border-red-300 text-red-600 hover:bg-red-50 font-medium"
    disabled={saving}
  >
    Excluir ministro
  </button>
)}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditMinister(null);
                  }}
                  className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEditSave}
                  className="px-3 py-1 text-sm rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F] disabled:opacity-60"
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
