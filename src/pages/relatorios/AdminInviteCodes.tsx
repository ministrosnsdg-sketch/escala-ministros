import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";

type InviteCode = {
  id: string;
  code: string;
  description: string | null;
  max_uses: number;
  used_count: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};

export default function AdminInviteCodes() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [desc, setDesc] = useState("");
  const [maxUses, setMaxUses] = useState(10);
  const [daysValid, setDaysValid] = useState(7);

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
    if (isAdmin) loadCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function loadCodes() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("invite_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      setError("Não foi possível carregar os códigos.");
    } else {
      setCodes((data || []) as InviteCode[]);
    }
    setLoading(false);
  }

  const generateRandomCode = () =>
    Math.random().toString(36).substring(2, 8).toUpperCase();

  async function handleCreate() {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);

    const code = generateRandomCode();
    const now = new Date();
    const expires =
      daysValid > 0
        ? new Date(now.getTime() + daysValid * 24 * 60 * 60 * 1000)
        : null;

    const { error } = await supabase.from("invite_codes").insert({
      code,
      description: desc || null,
      max_uses: maxUses,
      expires_at: expires ? expires.toISOString() : null,
      active: true,
      created_by: user?.id || null,
    });

    setSaving(false);

    if (error) {
      console.error(error);
      setError("Erro ao gerar código.");
      return;
    }

    setDesc("");
    loadCodes();
  }

  async function toggleActive(id: string, active: boolean) {
    if (!isAdmin) return;
    setSaving(true);
    const { error } = await supabase
      .from("invite_codes")
      .update({ active: !active })
      .eq("id", id);
    setSaving(false);
    if (error) {
      console.error(error);
      setError("Erro ao atualizar código.");
    } else {
      loadCodes();
    }
  }

  if (!isAdmin) {
    return (
      <p className="text-[10px] text-gray-600">
        Apenas administradores podem gerenciar códigos de acesso.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <div className="text-[9px] text-gray-700">
        Gere códigos para permitir cadastro de novos ministros pela tela de
        login.
      </div>

      {error && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-[9px] text-gray-600 mb-1">
              Descrição (opcional)
            </label>
            <input
              className="w-full border rounded px-2 py-1 text-[10px]"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ex: Turma 2025"
            />
          </div>
          <div>
            <label className="block text-[9px] text-gray-600 mb-1">
              Máx. usos
            </label>
            <input
              type="number"
              min={1}
              className="w-full border rounded px-2 py-1 text-[10px]"
              value={maxUses}
              onChange={(e) =>
                setMaxUses(Number(e.target.value) || 1)
              }
            />
          </div>
          <div>
            <label className="block text-[9px] text-gray-600 mb-1">
              Validade (dias)
            </label>
            <input
              type="number"
              min={0}
              className="w-full border rounded px-2 py-1 text-[10px]"
              value={daysValid}
              onChange={(e) =>
                setDaysValid(
                  Math.max(0, Number(e.target.value) || 0)
                )
              }
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-3 py-1.5 text-[9px] rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F] disabled:opacity-60"
          >
            {saving ? "Gerando..." : "Gerar novo código"}
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-[#D6E6F7] text-[10px] text-[#3F5F8F] font-semibold">
          Códigos gerados
        </div>
        {loading ? (
          <div className="p-3 text-[9px] text-gray-600">
            Carregando...
          </div>
        ) : codes.length === 0 ? (
          <div className="p-3 text-[9px] text-gray-600">
            Nenhum código gerado.
          </div>
        ) : (
          <table className="min-w-full text-[9px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left">Código</th>
                <th className="px-2 py-1 text-left">Descrição</th>
                <th className="px-2 py-1 text-center">Usos</th>
                <th className="px-2 py-1 text-center">Validade</th>
                <th className="px-2 py-1 text-center">Ativo</th>
                <th className="px-2 py-1 text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const expired =
                  c.expires_at &&
                  new Date(c.expires_at) < new Date();
                return (
                  <tr
                    key={c.id}
                    className="border-t border-gray-100"
                  >
                    <td className="px-2 py-1 font-semibold">
                      {c.code}
                    </td>
                    <td className="px-2 py-1">
                      {c.description || "-"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {c.used_count}/{c.max_uses}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {c.expires_at
                        ? expired
                          ? "Expirado"
                          : new Date(
                              c.expires_at
                            ).toLocaleDateString("pt-BR")
                        : "Sem limite"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {c.active && !expired ? "Sim" : "Não"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() =>
                          toggleActive(c.id, c.active)
                        }
                        disabled={saving}
                        className="px-2 py-0.5 border rounded text-[8px] hover:bg-gray-50"
                      >
                        {c.active ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
