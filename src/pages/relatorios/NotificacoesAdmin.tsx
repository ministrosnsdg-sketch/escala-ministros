import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { sendPushViaEdgeFunction, isPushSupported, getPushPermission, requestPushPermission, registerPushToken } from "../../lib/pushHelpers";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: "manual" | "swap" | "escala" | "aniversario";
  target: "all" | "admins";
  scheduled_at: string | null;
  sent: boolean;
  created_at: string;
};

type TokenInfo = {
  user_id: string;
  platform: string;
  has_endpoint: boolean;
  updated_at: string;
  minister_name?: string;
};

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  manual: { label: "Manual", icon: "📢", color: "bg-gray-100 text-gray-700" },
  swap: { label: "Troca de escala", icon: "🔄", color: "bg-blue-100 text-blue-700" },
  escala: { label: "Preencher escala", icon: "📅", color: "bg-green-100 text-green-700" },
  aniversario: { label: "Aniversariante", icon: "🎂", color: "bg-pink-100 text-pink-700" },
};

const PLATFORM_ICON: Record<string, string> = {
  android: "🤖",
  ios: "🍎",
  desktop: "💻",
};

export default function NotificacoesAdmin() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formType, setFormType] = useState<string>("manual");
  const [formTarget, setFormTarget] = useState<string>("all");
  const [formScheduled, setFormScheduled] = useState("");

  // Configurações automáticas
  const [autoEscala, setAutoEscala] = useState(true);
  const [autoSwap, setAutoSwap] = useState(true);
  const [autoAniversario, setAutoAniversario] = useState(true);

  // Diagnóstico
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [showDiag, setShowDiag] = useState(false);
  const [myPermission, setMyPermission] = useState<string>("verificando...");
  const [testingSend, setTestingSend] = useState(false);

  useEffect(() => {
    loadNotifications();
    loadSettings();
    loadTokens();
    checkMyPermission();
  }, []);

  async function checkMyPermission() {
    if (!isPushSupported()) {
      setMyPermission("não suportado neste navegador");
      return;
    }
    const perm = getPushPermission();
    setMyPermission(perm === "granted" ? "✅ concedida" : perm === "denied" ? "🚫 bloqueada" : "⏳ não solicitada");
  }

  async function loadTokens() {
    try {
      // Busca tokens com nome do ministro
      const { data: tokenData } = await supabase
        .from("push_tokens")
        .select("user_id, platform, endpoint, updated_at");

      if (!tokenData) return;

      // Busca nomes dos ministros
      const userIds = tokenData.map((t: any) => t.user_id).filter(Boolean);
      const { data: ministers } = await supabase
        .from("ministers")
        .select("user_id, name")
        .in("user_id", userIds);

      const nameMap: Record<string, string> = {};
      (ministers || []).forEach((m: any) => { if (m.user_id) nameMap[m.user_id] = m.name; });

      setTokens(tokenData.map((t: any) => ({
        user_id: t.user_id,
        platform: t.platform || "desktop",
        has_endpoint: !!t.endpoint,
        updated_at: t.updated_at,
        minister_name: nameMap[t.user_id] || "—",
      })));
    } catch {}
  }

  async function handleRegisterMyToken() {
    setSaving(true);
    const ok = await requestPushPermission();
    if (ok) {
      setFeedback({ type: "ok", msg: "✅ Notificações ativadas neste dispositivo!" });
      setMyPermission("✅ concedida");
    } else {
      setFeedback({ type: "err", msg: "Permissão não concedida. Verifique as configurações do navegador." });
    }
    await loadTokens();
    setSaving(false);
    setTimeout(() => setFeedback(null), 4000);
  }

  async function handleTestPush() {
    setTestingSend(true);
    setFeedback(null);

    // Cria uma notificação de teste temporária
    const { data: inserted, error } = await supabase
      .from("admin_notifications")
      .insert({
        title: "🔔 Teste de notificação",
        message: "Se você está vendo isso no celular, as notificações push estão funcionando!",
        type: "manual",
        target: "all",
        sent: false,
      })
      .select()
      .single();

    if (error || !inserted) {
      setFeedback({ type: "err", msg: "Erro ao criar notificação de teste." });
      setTestingSend(false);
      return;
    }

    const result = await sendPushViaEdgeFunction(
      inserted.title,
      inserted.message,
      "all",
      inserted.id
    );

    if (result.error) {
      setFeedback({
        type: "err",
        msg: `❌ Erro: ${result.error}. Verifique os secrets VAPID no Supabase.`,
      });
    } else if (result.total === 0) {
      setFeedback({ type: "ok", msg: "⚠️ Nenhum dispositivo registrado ainda. Peça para os ministros ativarem as notificações." });
    } else {
      setFeedback({
        type: "ok",
        msg: `✅ Push de teste enviado para ${result.sent} de ${result.total} dispositivo(s)!`,
      });
    }

    await loadNotifications();
    setTestingSend(false);
    setTimeout(() => setFeedback(null), 6000);
  }

  async function loadNotifications() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifications((data || []) as Notification[]);
    } catch {}
    setLoading(false);
  }

  async function loadSettings() {
    try {
      const { data } = await supabase
        .from("notification_settings")
        .select("*")
        .maybeSingle();
      if (data) {
        setAutoEscala(data.auto_escala ?? true);
        setAutoSwap(data.auto_swap ?? true);
        setAutoAniversario(data.auto_aniversario ?? true);
      }
    } catch {}
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("notification_settings")
        .select("id")
        .maybeSingle();

      const payload = {
        auto_escala: autoEscala,
        auto_swap: autoSwap,
        auto_aniversario: autoAniversario,
      };

      if (existing) {
        await supabase.from("notification_settings").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("notification_settings").insert(payload);
      }
      setFeedback({ type: "ok", msg: "Configurações salvas." });
    } catch {
      setFeedback({ type: "err", msg: "Erro ao salvar configurações." });
    }
    setSaving(false);
    setTimeout(() => setFeedback(null), 3000);
  }

  async function createNotification() {
    if (!formTitle.trim() || !formMessage.trim()) {
      setFeedback({ type: "err", msg: "Preencha título e mensagem." });
      return;
    }
    setSaving(true);
    setFeedback(null);

    const isImmediate = !formScheduled;

    const payload = {
      title: formTitle.trim(),
      message: formMessage.trim(),
      type: formType,
      target: formTarget as "all" | "admins",
      scheduled_at: formScheduled || null,
      sent: false,
    };

    const { data: inserted, error } = await supabase
      .from("admin_notifications")
      .insert(payload)
      .select()
      .single();

    if (error || !inserted) {
      setFeedback({ type: "err", msg: "Erro ao criar notificação." });
      setSaving(false);
      return;
    }

    if (isImmediate) {
      const result = await sendPushViaEdgeFunction(
        inserted.title,
        inserted.message,
        inserted.target,
        inserted.id
      );

      if (result.error) {
        setFeedback({
          type: "err",
          msg: `Notificação salva, mas erro no push: ${result.error}`,
        });
      } else if (result.total === 0) {
        setFeedback({
          type: "ok",
          msg: "Notificação criada. Nenhum dispositivo registrado ainda.",
        });
      } else {
        setFeedback({
          type: "ok",
          msg: `✅ Push enviado para ${result.sent} de ${result.total} dispositivo(s).`,
        });
      }
    } else {
      setFeedback({ type: "ok", msg: "Notificação agendada com sucesso." });
    }

    setShowForm(false);
    setFormTitle("");
    setFormMessage("");
    setFormType("manual");
    setFormTarget("all");
    setFormScheduled("");
    setSaving(false);
    await loadNotifications();
  }

  async function resendNotification(n: Notification) {
    setSaving(true);
    setFeedback(null);
    const result = await sendPushViaEdgeFunction(n.title, n.message, n.target, n.id);
    if (result.error) {
      setFeedback({ type: "err", msg: `Erro ao reenviar: ${result.error}` });
    } else {
      setFeedback({
        type: "ok",
        msg: `Push reenviado para ${result.sent} de ${result.total} dispositivo(s).`,
      });
    }
    setSaving(false);
    await loadNotifications();
    setTimeout(() => setFeedback(null), 4000);
  }

  async function deleteNotification(id: string) {
    if (!confirm("Excluir esta notificação?")) return;
    await supabase.from("admin_notifications").delete().eq("id", id);
    await loadNotifications();
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "agora há pouco";
    if (h < 24) return `há ${h}h`;
    const d = Math.floor(h / 24);
    return `há ${d} dia${d > 1 ? "s" : ""}`;
  }

  const androidCount = tokens.filter(t => t.platform === "android").length;
  const iosCount = tokens.filter(t => t.platform === "ios").length;
  const desktopCount = tokens.filter(t => t.platform === "desktop").length;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#1E3A6E]">Notificações</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Gerencie avisos e notificações push para os ministros.
        </p>
      </div>

      {feedback && (
        <div className={`text-sm px-4 py-3 rounded-2xl flex items-center gap-2 ${
          feedback.type === "ok"
            ? "text-green-700 bg-green-50 border border-green-200"
            : "text-red-600 bg-red-50 border border-red-200"
        }`}>
          <span>{feedback.type === "ok" ? "✅" : "⚠️"}</span>
          {feedback.msg}
        </div>
      )}

      {/* ── PAINEL DE STATUS DOS DISPOSITIVOS ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setShowDiag(v => !v)}
          className="w-full px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">📱</span>
            <div className="text-left">
              <h3 className="text-sm font-bold text-[#1E3A6E]">Dispositivos registrados</h3>
              <p className="text-xs text-gray-500">
                {tokens.length === 0
                  ? "Nenhum dispositivo ainda"
                  : `${tokens.length} dispositivo${tokens.length > 1 ? "s" : ""} · 🤖 ${androidCount} Android · 🍎 ${iosCount} iOS · 💻 ${desktopCount} Desktop`}
              </p>
            </div>
          </div>
          <span className="text-gray-400 text-xs">{showDiag ? "▲" : "▼"}</span>
        </button>

        {showDiag && (
          <div className="p-4 space-y-4">
            {/* Status deste dispositivo */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-blue-800 mb-2">📍 Este dispositivo (admin)</p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-blue-700">
                    Permissão: <span className="font-semibold">{myPermission}</span>
                  </p>
                  <p className="text-xs text-blue-500 mt-0.5">
                    {isPushSupported() ? "Navegador suporta push ✓" : "⚠️ Navegador não suporta push"}
                  </p>
                </div>
                {isPushSupported() && getPushPermission() !== "granted" && (
                  <button
                    onClick={handleRegisterMyToken}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-[#4A6FA5] text-white text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                  >
                    Ativar aqui
                  </button>
                )}
                {isPushSupported() && getPushPermission() === "granted" && (
                  <button
                    onClick={async () => { await registerPushToken(); setFeedback({ type: "ok", msg: "Token re-registrado." }); await loadTokens(); setTimeout(() => setFeedback(null), 3000); }}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                  >
                    Atualizar token
                  </button>
                )}
              </div>
            </div>

            {/* Botão de teste */}
            <button
              onClick={handleTestPush}
              disabled={testingSend || tokens.length === 0}
              className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {testingSend ? (
                <><span className="animate-spin">⏳</span> Enviando teste...</>
              ) : (
                <><span>🚀</span> Enviar push de teste para todos ({tokens.length})</>
              )}
            </button>

            {tokens.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">Nenhum dispositivo registrado.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Os ministros precisam abrir o app e aceitar as notificações.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {tokens.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl">
                    <span className="text-xl">{PLATFORM_ICON[t.platform] || "📱"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.minister_name}</p>
                      <p className="text-xs text-gray-500">
                        {t.platform} · {timeAgo(t.updated_at)}
                        {!t.has_endpoint && <span className="text-amber-500 ml-1">· token antigo</span>}
                      </p>
                    </div>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.has_endpoint ? "bg-green-400" : "bg-amber-400"}`} />
                  </div>
                ))}
              </div>
            )}

            {/* Checklist VAPID */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 mb-2">⚙️ Checklist de configuração</p>
              <div className="space-y-1">
                {[
                  { label: "VITE_VAPID_PUBLIC_KEY no .env.local", ok: !!import.meta.env.VITE_VAPID_PUBLIC_KEY },
                  { label: "Edge Function send-push deployada no Supabase", ok: null },
                  { label: "Secrets VAPID configurados no Supabase", ok: null },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm">{item.ok === true ? "✅" : item.ok === false ? "❌" : "⬜"}</span>
                    <span className="text-xs text-amber-700">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-amber-600 mt-2">
                Para os dois últimos: acesse o painel do Supabase → Edge Functions → send-push
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── NOTIFICAÇÕES AUTOMÁTICAS ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#1E3A6E]">Notificações automáticas</h3>
          <p className="text-xs text-gray-500 mt-0.5">Avisos exibidos automaticamente no sistema</p>
        </div>

        <div className="divide-y divide-gray-100">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg">🔄</span>
              <div>
                <p className="text-sm font-medium text-gray-800">Troca de escala</p>
                <p className="text-xs text-gray-500">Avisar quando houver solicitações de troca pendentes</p>
              </div>
            </div>
            <button
              onClick={() => setAutoSwap(!autoSwap)}
              className={`ml-3 relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${autoSwap ? "bg-[#4A6FA5]" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${autoSwap ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg">📅</span>
              <div>
                <p className="text-sm font-medium text-gray-800">Lembrete de escala</p>
                <p className="text-xs text-gray-500">Toda segunda-feira, lembrar de preencher a disponibilidade</p>
              </div>
            </div>
            <button
              onClick={() => setAutoEscala(!autoEscala)}
              className={`ml-3 relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${autoEscala ? "bg-[#4A6FA5]" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${autoEscala ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg">🎂</span>
              <div>
                <p className="text-sm font-medium text-gray-800">Aniversariantes do mês</p>
                <p className="text-xs text-gray-500">Notificar aniversariantes no início de cada mês</p>
              </div>
            </div>
            <button
              onClick={() => setAutoAniversario(!autoAniversario)}
              className={`ml-3 relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${autoAniversario ? "bg-[#4A6FA5]" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${autoAniversario ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[#4A6FA5] text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
      </div>

      {/* ── NOTIFICAÇÕES MANUAIS ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1E3A6E]">Notificações manuais</h3>
            <p className="text-xs text-gray-500 mt-0.5">Crie avisos personalizados com dia e hora</p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setFeedback(null); }}
            className="px-3 py-1.5 rounded-lg bg-[#4A6FA5] text-white text-xs font-semibold"
          >
            {showForm ? "Cancelar" : "+ Novo aviso"}
          </button>
        </div>

        {showForm && (
          <div className="p-4 space-y-3 border-b border-gray-100">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Título *</label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-[#4A6FA5] focus:outline-none"
                placeholder="Ex: Reunião de ministros"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Mensagem *</label>
              <textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-[#4A6FA5] focus:outline-none resize-none"
                rows={3}
                placeholder="Detalhes da notificação..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-[#4A6FA5] focus:outline-none"
                >
                  <option value="manual">Aviso geral</option>
                  <option value="escala">Escala</option>
                  <option value="aniversario">Aniversário</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Destinatário</label>
                <select
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-[#4A6FA5] focus:outline-none"
                >
                  <option value="all">Todos os ministros</option>
                  <option value="admins">Apenas coordenação</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Agendar para (opcional)
              </label>
              <input
                type="datetime-local"
                value={formScheduled}
                onChange={(e) => setFormScheduled(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-[#4A6FA5] focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Deixe vazio para enviar imediatamente.</p>
            </div>
            <button
              onClick={createNotification}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-[#4A6FA5] text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Enviando..." : formScheduled ? "Agendar notificação" : "Enviar push agora"}
            </button>
          </div>
        )}

        {/* Lista de notificações */}
        {loading ? (
          <div className="p-4 text-sm text-gray-500 text-center">Carregando...</div>
        ) : notifications.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-gray-500">Nenhuma notificação criada.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[50vh] overflow-y-auto">
            {notifications.map((n) => {
              const typeInfo = TYPE_LABELS[n.type] || TYPE_LABELS.manual;
              const isPast = n.scheduled_at && new Date(n.scheduled_at) < new Date();
              return (
                <div key={n.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                          {typeInfo.icon} {typeInfo.label}
                        </span>
                        {n.scheduled_at && !n.sent && !isPast && (
                          <span className="text-xs text-amber-600 font-medium">Agendada</span>
                        )}
                        {(n.sent || isPast) && (
                          <span className="text-xs text-green-600 font-medium">✓ Enviada</span>
                        )}
                        {isPast && !n.sent && (
                          <button
                            onClick={() => resendNotification(n)}
                            disabled={saving}
                            className="text-xs text-[#4A6FA5] font-medium underline disabled:opacity-50"
                          >
                            Reenviar
                          </button>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-800">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {n.scheduled_at
                          ? `Agendada: ${formatDateTime(n.scheduled_at)}`
                          : `Criada: ${formatDateTime(n.created_at)}`}
                        {" · "}
                        {n.target === "all" ? "Todos" : "Coordenação"}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteNotification(n.id)}
                      className="text-gray-300 hover:text-red-500 text-xs flex-shrink-0 mt-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
