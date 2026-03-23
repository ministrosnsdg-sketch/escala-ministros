import { useEffect, useState, useMemo } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

type SwapRequest = {
  id: string;
  requester_id: string;
  requester_name: string;
  date: string;
  time: string;
  title: string | null;
  source_type: "regular" | "extra";
  source_horario_id: number | null;
  source_extra_id: number | null;
  accepter_id: string | null;
  accepter_name: string | null;
  status: "pending" | "accepted" | "expired" | "cancelled";
  created_at: string;
  expires_at: string;
};

export default function TrocaEscalaPage() {
  return (
    <RequireAuth>
      <Layout>
        <TrocaEscalaInner />
      </Layout>
    </RequireAuth>
  );
}

function TrocaEscalaInner() {
  const { user } = useAuth();
  const [ministerId, setMinisterId] = useState<string | null>(null);
  const [ministerName, setMinisterName] = useState("");
  const [loading, setLoading] = useState(true);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [availableSwaps, setAvailableSwaps] = useState<SwapRequest[]>([]);
  const [myAssignments, setMyAssignments] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Load minister info
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("ministers")
        .select("id, name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setMinisterId(data.id);
        setMinisterName(data.name);
      }
      setLoading(false);
    })();
  }, [user]);

  // Load data
  useEffect(() => {
    if (!ministerId) return;
    loadData();
  }, [ministerId]);

  async function loadData() {
    setLoading(true);
    const now = new Date();
    const start = now.toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);

    // Load my swap requests
    const { data: mySwaps } = await supabase
      .from("swap_requests")
      .select("*")
      .eq("requester_id", ministerId)
      .gte("date", start)
      .order("created_at", { ascending: false });

    setSwapRequests((mySwaps || []) as SwapRequest[]);

    // Load available swaps from others (pending, not expired)
    const { data: othersSwaps } = await supabase
      .from("swap_requests")
      .select("*")
      .neq("requester_id", ministerId)
      .eq("status", "pending")
      .gte("expires_at", new Date().toISOString())
      .gte("date", start)
      .order("date", { ascending: true });

    setAvailableSwaps((othersSwaps || []) as SwapRequest[]);

    // Load my upcoming assignments for creating swap requests
    const { data: horarios } = await supabase.from("horarios").select("id, time");
    const hMap = new Map<number, string>();
    (horarios || []).forEach((h: any) => hMap.set(h.id, h.time));

    // Try escala_regular first
    let assignments: any[] = [];
    const { data: regData } = await supabase
      .from("escala_regular")
      .select("date, horario_id, minister_id")
      .eq("minister_id", ministerId)
      .gte("date", start)
      .lte("date", end);

    if (regData && regData.length > 0) {
      assignments = regData.map((r: any) => ({
        date: r.date,
        time: hMap.get(r.horario_id) || "",
        type: "regular",
        horario_id: r.horario_id,
        extra_id: null,
        title: null,
      }));
    } else {
      // Fallback to availability
      const { data: avData } = await supabase
        .from("monthly_availability_regular")
        .select("date, horario_id")
        .eq("minister_id", ministerId)
        .gte("date", start)
        .lte("date", end);

      assignments = (avData || []).map((r: any) => ({
        date: r.date,
        time: hMap.get(r.horario_id) || "",
        type: "regular",
        horario_id: r.horario_id,
        extra_id: null,
        title: null,
      }));
    }

    // Load extras assignments
    const { data: extras } = await supabase
      .from("extras")
      .select("id, event_date, time, title")
      .eq("active", true)
      .gte("event_date", start)
      .lte("event_date", end);

    const extraMap = new Map<number, any>();
    (extras || []).forEach((e: any) => extraMap.set(e.id, e));

    const { data: extAssign } = await supabase
      .from("escala_extras")
      .select("extra_id, minister_id")
      .eq("minister_id", ministerId);

    if (extAssign) {
      extAssign.forEach((r: any) => {
        const info = extraMap.get(r.extra_id);
        if (info) {
          assignments.push({
            date: info.event_date,
            time: info.time,
            type: "extra",
            horario_id: null,
            extra_id: r.extra_id,
            title: info.title,
          });
        }
      });
    }

    // Filter only future assignments (at least 30min from now)
    const cutoff = new Date(Date.now() + 30 * 60 * 1000);
    const futureAssignments = assignments.filter((a: any) => {
      const dt = new Date(`${a.date}T${a.time.slice(0, 5)}:00`);
      return dt > cutoff;
    });

    futureAssignments.sort((a: any, b: any) =>
      a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
    );

    setMyAssignments(futureAssignments);
    setLoading(false);
  }

  async function createSwapRequest() {
    if (!ministerId || !selectedAssignment) return;
    setSaving(true);
    setError(null);

    const a = selectedAssignment;
    const massDateTime = new Date(`${a.date}T${a.time.slice(0, 5)}:00`);
    const expiresAt = new Date(massDateTime.getTime() - 30 * 60 * 1000); // 30min before mass

    if (expiresAt <= new Date()) {
      setError("Não é possível solicitar troca com menos de 30 minutos de antecedência.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("swap_requests").insert({
      requester_id: ministerId,
      requester_name: ministerName,
      date: a.date,
      time: a.time.slice(0, 5) + ":00",
      title: a.title || null,
      source_type: a.type,
      source_horario_id: a.horario_id,
      source_extra_id: a.extra_id,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      setError("Erro ao criar solicitação de troca.");
      setSaving(false);
      return;
    }

    setInfo("Solicitação de troca criada com sucesso!");
    setShowCreateModal(false);
    setSelectedAssignment(null);
    setSaving(false);
    await loadData();
  }

  async function acceptSwap(swap: SwapRequest) {
    if (!ministerId) return;
    setSaving(true);
    setError(null);

    // Check if still valid
    if (new Date(swap.expires_at) <= new Date()) {
      setError("Esta solicitação de troca já expirou.");
      setSaving(false);
      return;
    }

    // Update swap request
    const { error: updateError } = await supabase
      .from("swap_requests")
      .update({
        accepter_id: ministerId,
        accepter_name: ministerName,
        status: "accepted",
      })
      .eq("id", swap.id);

    if (updateError) {
      setError("Erro ao aceitar troca.");
      setSaving(false);
      return;
    }

    // Perform the actual swap in the database
    if (swap.source_type === "regular" && swap.source_horario_id) {
      // Remove original minister from escala
      await supabase
        .from("escala_regular")
        .delete()
        .eq("date", swap.date)
        .eq("horario_id", swap.source_horario_id)
        .eq("minister_id", swap.requester_id);

      // Add accepter
      await supabase.from("escala_regular").insert({
        date: swap.date,
        horario_id: swap.source_horario_id,
        minister_id: ministerId,
      });

      // Also swap in availability
      await supabase
        .from("monthly_availability_regular")
        .delete()
        .eq("date", swap.date)
        .eq("horario_id", swap.source_horario_id)
        .eq("minister_id", swap.requester_id);

      await supabase.from("monthly_availability_regular").upsert({
        minister_id: ministerId,
        date: swap.date,
        horario_id: swap.source_horario_id,
      });
    } else if (swap.source_type === "extra" && swap.source_extra_id) {
      await supabase
        .from("escala_extras")
        .delete()
        .eq("extra_id", swap.source_extra_id)
        .eq("minister_id", swap.requester_id);

      await supabase.from("escala_extras").insert({
        extra_id: swap.source_extra_id,
        minister_id: ministerId,
      });

      await supabase
        .from("availability_extras")
        .delete()
        .eq("extra_id", swap.source_extra_id)
        .eq("minister_id", swap.requester_id);

      await supabase.from("availability_extras").upsert({
        minister_id: ministerId,
        extra_id: swap.source_extra_id,
      });
    }

    setInfo("Troca aceita com sucesso! Você assumiu esta celebração.");
    setSaving(false);
    await loadData();
  }

  async function cancelSwap(swapId: string) {
    if (!confirm("Cancelar esta solicitação de troca?")) return;
    await supabase.from("swap_requests").update({ status: "cancelled" }).eq("id", swapId);
    setInfo("Solicitação cancelada.");
    await loadData();
  }

  function formatDateBR(iso: string) {
    return iso.split("-").reverse().join("/");
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-bold text-[#1E3A6E] mb-2">Troca de Escala</h2>
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#1E3A6E]">Troca de Escala</h2>
        <p className="text-xs text-gray-500 mt-0.5">Solicite ou aceite trocas de celebrações</p>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border-2 border-red-200 px-4 py-3 rounded-2xl flex items-center gap-2">
          <span>⚠️</span>{error}
        </div>
      )}
      {info && (
        <div className="text-sm text-green-700 bg-green-50 border-2 border-green-200 px-4 py-3 rounded-2xl flex items-center gap-2">
          <span>✅</span>{info}
        </div>
      )}

      {/* Botão criar troca */}
      <button
        onClick={() => { setShowCreateModal(true); setError(null); setInfo(null); }}
        className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] text-white text-sm font-bold shadow-md shadow-blue-100 active:scale-95 transition-transform"
      >
        🔄 Solicitar Troca
      </button>

      {/* Trocas disponíveis de outros ministros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-[#EEF4FF] to-[#F8FAFF] border-b border-gray-100">
          <span className="text-sm font-semibold text-[#1E3A6E]">🤝 Pedidos de troca disponíveis</span>
        </div>

        {availableSwaps.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm text-gray-500">Nenhuma solicitação de troca disponível no momento.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {availableSwaps.map((swap) => (
              <div key={swap.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {formatDateBR(swap.date)} · {swap.time.slice(0, 5)}h
                      {swap.title && <span className="text-purple-600 ml-1">· {swap.title}</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <span className="font-medium text-[#4A6FA5]">{swap.requester_name}</span> precisa de troca
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Expira: {new Date(swap.expires_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <button
                    onClick={() => acceptSwap(swap)}
                    disabled={saving}
                    className="ml-3 px-4 py-2 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 disabled:opacity-50 flex-shrink-0"
                  >
                    Aceitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minhas solicitações */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-white border-b border-gray-100">
          <span className="text-sm font-semibold text-amber-800">📋 Minhas solicitações de troca</span>
        </div>

        {swapRequests.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-gray-500">Nenhuma solicitação criada.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {swapRequests.map((swap) => {
              const isExpired = new Date(swap.expires_at) <= new Date() && swap.status === "pending";
              const statusLabel = isExpired ? "Expirada" : swap.status === "pending" ? "Aguardando" : swap.status === "accepted" ? "Aceita" : swap.status === "cancelled" ? "Cancelada" : swap.status;
              const statusColor = isExpired ? "text-gray-400" : swap.status === "pending" ? "text-amber-600" : swap.status === "accepted" ? "text-green-600" : "text-gray-400";

              return (
                <div key={swap.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {formatDateBR(swap.date)} · {swap.time.slice(0, 5)}h
                        {swap.title && <span className="text-purple-600 ml-1">· {swap.title}</span>}
                      </p>
                      <p className={`text-xs font-medium mt-0.5 ${statusColor}`}>
                        {statusLabel}
                        {swap.status === "accepted" && swap.accepter_name && (
                          <span className="text-gray-500"> — {swap.accepter_name} assumiu</span>
                        )}
                      </p>
                    </div>
                    {swap.status === "pending" && !isExpired && (
                      <button
                        onClick={() => cancelSwap(swap.id)}
                        className="ml-3 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 flex-shrink-0"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal criar troca */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#1E3A6E]">Solicitar Troca</h3>
                <p className="text-xs text-gray-500">Selecione a celebração que deseja trocar</p>
              </div>
              <button onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg font-bold">
                ×
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
              {myAssignments.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-2xl mb-2">📅</p>
                  <p className="text-sm">Nenhuma celebração futura disponível para troca.</p>
                  <p className="text-xs text-gray-400 mt-1">Trocas devem ser solicitadas com pelo menos 30 minutos de antecedência.</p>
                </div>
              ) : (
                myAssignments.map((a, i) => {
                  const isSelected = selectedAssignment === a;
                  return (
                    <button
                      key={`${a.date}-${a.time}-${i}`}
                      onClick={() => setSelectedAssignment(isSelected ? null : a)}
                      className={`w-full text-left p-3 rounded-2xl border-2 transition-all ${
                        isSelected
                          ? "bg-[#EEF4FF] border-[#4A6FA5]"
                          : "bg-gray-50 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <p className="text-sm font-bold text-gray-800">
                        {formatDateBR(a.date)} · {a.time.slice(0, 5)}h
                      </p>
                      <p className="text-xs text-gray-500">
                        {a.title ? <span className="text-purple-600">{a.title}</span> : "Missa"}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            {myAssignments.length > 0 && (
              <div className="px-5 py-4 border-t border-gray-100">
                <button
                  onClick={createSwapRequest}
                  disabled={!selectedAssignment || saving}
                  className={`w-full py-3.5 rounded-2xl text-white text-sm font-bold shadow-md active:scale-95 transition-transform ${
                    selectedAssignment
                      ? "bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] shadow-blue-100"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {saving ? "Criando..." : "Solicitar Troca"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
