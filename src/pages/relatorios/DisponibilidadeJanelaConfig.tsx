import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";

/**
 * NOVO MODELO DE CONTROLE
 * - availability_settings: mantém as configurações padrão (days_before_next_month, hard_close)
 * - availability_overrides: liberações manuais por (ano, mês) com janela [open_from, open_until]
 *
 * Tela:
 *  - Permite salvar configuração padrão (igual antes)
 *  - Botões de liberação manual:
 *      • Liberar mês vigente (até o fim do mês)
 *      • Liberar mês seguinte (até o fim do mês seguinte)
 *  - Lista as liberações ativas e permite revogar
 */

type AvailabilitySettings = {
  id: number;
  days_before_next_month: number | null;
  hard_close: boolean | null;
  created_at: string;
};

type AvailabilityOverride = {
  id: number;
  year: number;
  month: number; // 1..12
  open_from: string;   // ISO
  open_until: string;  // ISO
  created_at: string;
};

export default function DisponibilidadeJanelaConfig() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // config padrão
  const [daysBefore, setDaysBefore] = useState(10);
  const [hardClose, setHardClose] = useState(false);

  // overrides
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);

  // ui
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Verifica admin
  useEffect(() => {
    const check = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from("ministers")
        .select("is_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error(error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(!!data?.is_admin);
    };
    check();
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      // settings (pega a última)
      const { data: cfg, error: cfgErr } = await supabase
        .from("availability_settings")
        .select("*")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cfgErr) {
        console.error(cfgErr);
        setError("Erro ao carregar configurações.");
      } else if (cfg) {
        const c = cfg as AvailabilitySettings;
        setDaysBefore(c.days_before_next_month ?? 10);
        setHardClose(!!c.hard_close);
      }

      // overrides ativos (com open_until >= hoje)
      const todayISO = new Date().toISOString();
      const { data: ov, error: ovErr } = await supabase
        .from("availability_overrides")
        .select("*")
        .gte("open_until", todayISO)
        .order("open_from", { ascending: true });

      if (ovErr) {
        console.error(ovErr);
        setError("Erro ao carregar liberações manuais.");
      } else {
        setOverrides((ov || []) as AvailabilityOverride[]);
      }
    } finally {
      setLoading(false);
    }
  }

  // salvar configuração padrão
  async function save() {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.from("availability_settings").insert({
      days_before_next_month: daysBefore,
      hard_close: hardClose,
    });

    setSaving(false);

    if (error) {
      console.error(error);
      setError("Erro ao salvar configurações.");
    } else {
      setMessage("Configurações salvas.");
      loadAll();
    }
  }

  // util: fim do mês
  function endOfMonth(year: number, month1to12: number) {
    // JS: new Date(year, monthIndex+1, 0) => último dia; mês 0-based
    const d = new Date(year, month1to12, 0);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  const now = useMemo(() => new Date(), []);
  const currYear = now.getFullYear();
  const currMonth1to12 = now.getMonth() + 1;
  const nextYear = currMonth1to12 === 12 ? currYear + 1 : currYear;
  const nextMonth1to12 = currMonth1to12 === 12 ? 1 : currMonth1to12 + 1;

  // liberar mês vigente: de agora até o fim do mês corrente
  async function liberarMesVigente() {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const open_from = new Date();
    const open_until = endOfMonth(currYear, currMonth1to12);

    const { error } = await supabase.from("availability_overrides").insert({
      year: currYear,
      month: currMonth1to12,
      open_from: open_from.toISOString(),
      open_until: open_until.toISOString(),
    });

    setSaving(false);
    if (error) {
      console.error(error);
      setError("Erro ao liberar o mês vigente.");
    } else {
      setMessage("Mês vigente liberado para edição até o fim do mês.");
      loadAll();
    }
  }

  // liberar mês seguinte: de agora até o fim do mês seguinte
  async function liberarMesSeguinte() {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const open_from = new Date();
    const open_until = endOfMonth(nextYear, nextMonth1to12);

    const { error } = await supabase.from("availability_overrides").insert({
      year: nextYear,
      month: nextMonth1to12,
      open_from: open_from.toISOString(),
      open_until: open_until.toISOString(),
    });

    setSaving(false);
    if (error) {
      console.error(error);
      setError("Erro ao liberar o mês seguinte.");
    } else {
      setMessage("Mês seguinte liberado para edição até o fim do próximo mês.");
      loadAll();
    }
  }

  // revogar liberação manual
  async function revogar(overrideId: number) {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase
      .from("availability_overrides")
      .delete()
      .eq("id", overrideId);

    setSaving(false);
    if (error) {
      console.error(error);
      setError("Erro ao revogar liberação.");
    } else {
      setMessage("Liberação revogada.");
      loadAll();
    }
  }

  if (!isAdmin) {
    return (
      <p className="text-[10px] text-gray-600">
        Apenas administradores podem configurar a janela de disponibilidade.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <div className="bg-[#F7FAFF] border border-[#D6E6F7] rounded-xl px-3 py-2 text-[9px] text-[#3F5F8F]">
        <p>
          Configure a abertura padrão e faça liberações manuais por mês (vigente
          ou seguinte). As liberações manuais têm data de início e fim.
        </p>
      </div>

      {loading ? (
        <p className="text-[10px] text-gray-600">Carregando...</p>
      ) : (
        <>
          {error && (
            <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
              {error}
            </div>
          )}
          {message && (
            <div className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded">
              {message}
            </div>
          )}

          {/* Configuração padrão */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3 text-[9px]">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-[9px] text-gray-700 mb-1">
                  Dias antes do próximo mês para abrir o preenchimento
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-full border rounded px-2 py-1 text-[10px]"
                  value={daysBefore}
                  onChange={(e) =>
                    setDaysBefore(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  id="hardClose"
                  type="checkbox"
                  checked={hardClose}
                  onChange={(e) => setHardClose(e.target.checked)}
                />
                <label htmlFor="hardClose" className="text-[9px] text-gray-700">
                  Encerrar totalmente a edição após o prazo
                </label>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 rounded-full bg-[#4A6FA5] text-white text-[9px] hover:bg-[#3F5F8F] disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar configurações"}
              </button>

              {/* Liberações manuais */}
              <button
                onClick={liberarMesVigente}
                disabled={saving}
                className="px-3 py-1.5 rounded-full border border-[#4A6FA5] text-[#4A6FA5] text-[9px] hover:bg-[#E6EEF9] disabled:opacity-60"
              >
                Liberar mês vigente
              </button>

              <button
                onClick={liberarMesSeguinte}
                disabled={saving}
                className="px-3 py-1.5 rounded-full border border-[#4A6FA5] text-[#4A6FA5] text-[9px] hover:bg-[#E6EEF9] disabled:opacity-60"
              >
                Liberar mês seguinte
              </button>
            </div>
          </div>

          {/* Lista de liberações ativas */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 text-[9px]">
            <div className="text-[10px] font-semibold text-[#3F5F8F]">
              Liberações manuais ativas
            </div>
            {overrides.length === 0 ? (
              <div className="text-[10px] text-gray-600">
                Nenhuma liberação manual ativa.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-[10px]">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-1 pr-3">Mês/Ano</th>
                      <th className="py-1 pr-3">Início</th>
                      <th className="py-1 pr-3">Fim</th>
                      <th className="py-1 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {overrides.map((ov) => {
                      const openFrom = new Date(ov.open_from);
                      const openUntil = new Date(ov.open_until);
                      return (
                        <tr key={ov.id} className="border-b last:border-b-0">
                          <td className="py-1 pr-3">
                            {String(ov.month).padStart(2, "0")}/{ov.year}
                          </td>
                          <td className="py-1 pr-3">
                            {openFrom.toLocaleString()}
                          </td>
                          <td className="py-1 pr-3">
                            {openUntil.toLocaleString()}
                          </td>
                          <td className="py-1 pr-3">
                            <button
                              onClick={() => revogar(ov.id)}
                              className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                              disabled={saving}
                            >
                              Revogar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
