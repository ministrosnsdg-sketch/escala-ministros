import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";

type Minister = {
  id: string;
  name: string;
};

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

export default function ResumoPorMinistro() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // mês padrão = próximo mês
  const now = new Date();
  const defaultMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const defaultYear =
    now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);

  const first = useMemo(() => new Date(year, month, 1), [year, month]);
  const last = useMemo(() => new Date(year, month + 1, 0), [year, month]);
  const start = useMemo(() => iso(first), [first]);
  const end = useMemo(() => iso(last), [last]);
  const label = useMemo(
    () => `${MONTH_NAMES[month]} / ${year}`,
    [month, year]
  );

  const [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState<
    { minister_id: string; name: string; total: number }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  // checa admin
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
    if (isAdmin) loadRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, month, year]);

  async function loadRanking() {
    setLoading(true);
    setError(null);

    // ministros
    const { data: mData, error: mErr } = await supabase
      .from("ministers")
      .select("id, name")
      .order("name");

    if (mErr) {
      console.error(mErr);
      setError("Erro ao carregar ministros.");
      setLoading(false);
      return;
    }
    const ministers = (mData || []) as Minister[];

    // disponibilidade normal
    const { data: avData, error: avErr } = await supabase
      .from("monthly_availability_regular")
      .select("minister_id, date")
      .gte("date", start)
      .lte("date", end);

    if (avErr) {
      console.error(avErr);
      setError("Erro ao carregar disponibilidades.");
      setLoading(false);
      return;
    }

    // extras do mês
    const { data: exData, error: exErr } = await supabase
      .from("extras")
      .select("id, event_date")
      .gte("event_date", start)
      .lte("event_date", end)
      .eq("active", true);

    if (exErr) {
      console.error(exErr);
      setError("Erro ao carregar missas extras.");
      setLoading(false);
      return;
    }

    const extraIds = (exData || []).map((e: any) => e.id);

    let avExtras: { minister_id: string; extra_id: number }[] = [];
    if (extraIds.length > 0) {
      const { data: avExData, error: avExErr } = await supabase
        .from("availability_extras")
        .select("minister_id, extra_id")
        .in("extra_id", extraIds);

      if (avExErr) {
        console.error(avExErr);
        setError("Erro ao carregar disponibilidades em extras.");
        setLoading(false);
        return;
      }
      avExtras = (avExData || []) as any;
    }

    const counter = new Map<string, number>();

    (avData || []).forEach((row: any) => {
      counter.set(
        row.minister_id,
        (counter.get(row.minister_id) || 0) + 1
      );
    });

    avExtras.forEach((row) => {
      counter.set(
        row.minister_id,
        (counter.get(row.minister_id) || 0) + 1
      );
    });

    const list = ministers
      .map((m) => ({
        minister_id: m.id,
        name: m.name,
        total: counter.get(m.id) || 0,
      }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    setRanking(list);
    setLoading(false);
  }

  if (!isAdmin) {
    return (
      <p className="text-[10px] text-gray-600">
        Apenas administradores podem visualizar o resumo por ministro.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      {/* Seletor de mês */}
      <div className="flex flex-wrap gap-2 items-center text-[9px]">
        <div className="font-semibold text-[#4A6FA5]">
          Resumo por ministro — {label}
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
      </div>

      <div className="bg-[#F7FAFF] border border-[#D6E6F7] rounded-xl px-3 py-2 text-[9px] text-[#3F5F8F]">
        <p>
          Cada marcação de disponibilidade (missa fixa ou extra) conta 1 ponto.
          A lista abaixo mostra quem mais se colocou disponível no período.
        </p>
      </div>

      {error && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[10px] text-gray-600">
          Calculando resumo...
        </p>
      ) : ranking.length === 0 ? (
        <p className="text-[9px] text-gray-500">
          Nenhuma disponibilidade registrada para este mês.
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="min-w-full text-[9px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-center">Posição</th>
                <th className="px-2 py-1 text-left">Ministro</th>
                <th className="px-2 py-1 text-center">
                  Qtde de missas selecionadas
                </th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr
                  key={r.minister_id}
                  className="border-t border-gray-100"
                >
                  <td className="px-2 py-1 text-center font-semibold text-[#4A6FA5]">
                    {i + 1}
                  </td>
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1 text-center font-semibold">
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
