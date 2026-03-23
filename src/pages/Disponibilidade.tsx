// PARTE 1 — topo do arquivo
import {
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  UNSAFE_NavigationContext as NavigationContext,
  useNavigate,
} from "react-router-dom";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

type Minister = {
  id: string;
  name: string;
  is_admin: boolean;
};

type AvailabilityOverride = {
  id: number;
  year: number;
  month: number;
  open_from: string;
  open_until: string;
  created_at?: string;
};

type Horario = {
  id: number;
  weekday: number;
  time: string;
  min_required: number;
  max_allowed: number;
  active: boolean;
};

type Extra = {
  id: number;
  event_date: string;
  time: string;
  title: string;
  min_required: number;
  max_allowed: number;
  active: boolean;
};

type BlockedMass = {
  id: number;
  date: string;
  blocked_times: string[] | null;
  reason: string | null;
};

type MonthlyAvailabilityRow = {
  minister_id: string;
  date: string;
  horario_id: number;
};

const WEEKDAYS_FULL = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const WEEKDAYS_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];

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

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function DisponibilidadePage() {
  return (
    <RequireAuth>
      <Layout>
        <DisponibilidadeInner />
      </Layout>
    </RequireAuth>
  );
}

function DisponibilidadeInner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const navigation = useContext(NavigationContext) as any;

  const [me, setMe] = useState<Minister | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ministers, setMinisters] = useState<Minister[]>([]);
  const [ministerSearch, setMinisterSearch] = useState("");
  const [selectedMinisterId, setSelectedMinisterId] = useState<string | null>(
    null
  );

  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);

  const [originalMonthly, setOriginalMonthly] = useState<Set<string>>(
    new Set()
  );
  const [originalExtras, setOriginalExtras] = useState<Set<number>>(
    new Set()
  );

  const [monthlyDraft, setMonthlyDraft] = useState<Set<string>>(new Set());
  const [extrasDraft, setExtrasDraft] = useState<Set<number>>(new Set());

  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [extraCounts, setExtraCounts] = useState<Record<number, number>>({});

  const [blockedMasses, setBlockedMasses] = useState<BlockedMass[]>([]);
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());

  const [settingsDaysBefore, setSettingsDaysBefore] = useState<number>(10);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [settingsHardClose, setSettingsHardClose] = useState<boolean>(false);

  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingNav, setPendingNav] = useState<{ to: any; replace?: boolean } | null>(null);
  const [showNavConfirm, setShowNavConfirm] = useState(false);

  const [recWeekday, setRecWeekday] = useState<number | "">("");
  const [recHorarioId, setRecHorarioId] = useState<number | "">("");

  const now = new Date();
  const defaultMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const defaultYear =
    now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);

  const firstDayOfMonth = useMemo(
    () => new Date(year, month, 1),
    [year, month]
  );
  const lastDayOfMonth = useMemo(
    () => new Date(year, month + 1, 0),
    [year, month]
  );

  const monthLabel = useMemo(
    () => `${MONTH_NAMES[month]} / ${year}`,
    [month, year]
  );

  const realNextMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const realNextYear =
    now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

  // Regra janela
  const { canEditSelectedMonth, windowMessage } = useMemo(() => {
    const manual = overrides.find(
      (ov) =>
        ov.year === year &&
        ov.month === month + 1 &&
        new Date(ov.open_from) <= now &&
        now <= new Date(ov.open_until)
    );
    if (manual) {
      return {
        canEditSelectedMonth: true,
        windowMessage: `Edição liberada manualmente até ${new Date(
          manual.open_until
        ).toLocaleString("pt-BR")}.`,
      };
    }

    if (settingsHardClose) {
      return {
        canEditSelectedMonth: false,
        windowMessage: "Janela de edição encerrada pela coordenação.",
      };
    }

    if (year !== realNextYear || month !== realNextMonth) {
      return {
        canEditSelectedMonth: false,
        windowMessage:
          "Edição liberada apenas para o próximo mês definido pela coordenação.",
      };
    }

    const openFrom = new Date(realNextYear, realNextMonth, 1);
    openFrom.setDate(openFrom.getDate() - (settingsDaysBefore || 10));
    const closeAt = new Date(realNextYear, realNextMonth + 1, 0);

    if (now < openFrom) {
      return {
        canEditSelectedMonth: false,
        windowMessage: `A disponibilidade deste mês abrirá em ${openFrom.toLocaleDateString(
          "pt-BR"
        )}.`,
      };
    }

    if (now > closeAt) {
      return {
        canEditSelectedMonth: false,
        windowMessage: "A janela de edição para este mês já foi encerrada.",
      };
    }

    return {
      canEditSelectedMonth: true,
      windowMessage:
        "Janela de edição ativa. Confirme suas escolhas antes de sair da página.",
    };
  }, [
    settingsHardClose,
    settingsDaysBefore,
    year,
    month,
    realNextMonth,
    realNextYear,
    now,
    overrides,
  ]);

  // MATRIZ MENSAL
  const daysMatrix = useMemo(() => {
    const matrix: { day: number | null; date: string | null }[][] = [];
    const firstWeekday = firstDayOfMonth.getDay();
    const daysInMonth = lastDayOfMonth.getDate();
    let currentDay = 1;
    let done = false;

    while (!done) {
      const week: { day: number | null; date: string | null }[] = [];
      for (let i = 0; i < 7; i++) {
        if (
          (matrix.length === 0 && i < firstWeekday) ||
          currentDay > daysInMonth
        ) {
          week.push({ day: null, date: null });
        } else {
          const d = new Date(year, month, currentDay);
          week.push({ day: currentDay, date: formatDate(d) });
          currentDay++;
        }
      }
      matrix.push(week);
      if (currentDay > daysInMonth) done = true;
    }

    return matrix;
  }, [firstDayOfMonth, lastDayOfMonth, month, year]);

  const horariosPorWeekday = useMemo(() => {
    const map: Record<number, Horario[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    };
    horarios.forEach((h) => {
      if (h.active) map[h.weekday].push(h);
    });
    return map;
  }, [horarios]);

  const extrasByDate = useMemo(() => {
    const map: Record<string, Extra[]> = {};
    extras.forEach((e) => {
      if (!map[e.event_date]) map[e.event_date] = [];
      map[e.event_date].push(e);
    });
    return map;
  }, [extras]);
  const hasPendingChanges =
    JSON.stringify(Array.from(monthlyDraft).sort()) !==
      JSON.stringify(Array.from(originalMonthly).sort()) ||
    JSON.stringify(Array.from(extrasDraft).sort()) !==
      JSON.stringify(Array.from(originalExtras).sort());

  // Warn ao fechar aba
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasPendingChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };
    if (hasPendingChanges) {
      window.addEventListener("beforeunload", handler);
    }
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [hasPendingChanges]);

  // BLOQUEAR NAVEGAÇÃO INTERNA
  useEffect(() => {
    if (!navigation || !navigation.navigator) return;
    const nav = navigation.navigator;
    const originalPush = nav.push;
    const originalReplace = nav.replace;

    if (!hasPendingChanges || savingAll) {
      return () => {
        nav.push = originalPush;
        nav.replace = originalReplace;
      };
    }

    nav.push = (to: any, state?: any, opts?: any) => {
      if (hasPendingChanges && !savingAll) {
        setPendingNav({ to, replace: false });
        setShowNavConfirm(true);
        return;
      }
      return originalPush(to, state, opts);
    };

    nav.replace = (to: any, state?: any, opts?: any) => {
      if (hasPendingChanges && !savingAll) {
        setPendingNav({ to, replace: true });
        setShowNavConfirm(true);
        return;
      }
      return originalReplace(to, state, opts);
    };

    return () => {
      nav.push = originalPush;
      nav.replace = originalReplace;
    };
  }, [navigation, hasPendingChanges, savingAll]);

  // ========= CARREGAR BASE =========
  useEffect(() => {
    const init = async () => {
      if (!user) return;
      setLoadingBase(true);
      setError(null);

      const { data: meData, error: meErr } = await supabase
        .from("ministers")
        .select("id, name, is_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (meErr || !meData) {
        console.error(meErr);
        setError(
          "Seu usuário não está vinculado a um ministro. Procure a coordenação."
        );
        setLoadingBase(false);
        return;
      }

      const meMinister: Minister = {
        id: meData.id,
        name: meData.name,
        is_admin: meData.is_admin,
      };

      setMe(meMinister);
      setIsAdmin(!!meMinister.is_admin);
      setSelectedMinisterId(meMinister.id);

      if (meMinister.is_admin) {
        const { data: mins } = await supabase
          .from("ministers")
          .select("id, name, is_admin")
          .order("name", { ascending: true });

        if (mins) {
          setMinisters(
            mins.map((m: any) => ({
              id: m.id,
              name: m.name,
              is_admin: m.is_admin,
            }))
          );
        }
      } else {
        setMinisters([meMinister]);
      }

      const { data: hData, error: hErr } = await supabase
        .from("horarios")
        .select("*")
        .eq("active", true)
        .order("weekday", { ascending: true })
        .order("time", { ascending: true });

      if (hErr) {
        console.error(hErr);
        setError("Não foi possível carregar os horários.");
        setLoadingBase(false);
        return;
      }

      setHorarios((hData || []) as Horario[]);

      const { data: sData } = await supabase
        .from("availability_settings")
        .select("*")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sData) {
        setSettingsDaysBefore(sData.days_before_next_month ?? 10);
        setSettingsHardClose(!!sData.hard_close);
      }

      setLoadingBase(false);
    };

    init();
  }, [user]);

  // ========= CARREGAR MÊS =========
  useEffect(() => {
    const loadMonth = async () => {
      if (!selectedMinisterId || horarios.length === 0) return;

      setLoadingMonth(true);
      setError(null);
      setInfo(null);

      const start = formatDate(firstDayOfMonth);
      const end = formatDate(lastDayOfMonth);

      // disponibilidade normal
      const { data: avData, error: avErr } = await supabase
        .from("monthly_availability_regular")
        .select("minister_id, date, horario_id")
        .eq("minister_id", selectedMinisterId)
        .gte("date", start)
        .lte("date", end);
// Carregar bloqueios do mês
const { data: blocksData } = await supabase
  .from("blocked_masses")
  .select("*")
  .gte("date", start)
  .lte("date", end);

const blocks = (blocksData || []) as BlockedMass[];
setBlockedMasses(blocks);

const blockedDatesSet = new Set<string>();
blocks.forEach(b => {
  // A data está bloqueada se:
  // 1. blocked_times for NULL (dia todo bloqueado)
  // 2. OU blocked_times for um array não vazio (horários específicos bloqueados)
  if (!b.blocked_times || b.blocked_times.length > 0) {
    blockedDatesSet.add(b.date);
  }
});
setBlockedDates(blockedDatesSet);
      if (avErr) {
        console.error(avErr);
        setError("Não foi possível carregar sua disponibilidade.");
        setLoadingMonth(false);
        return;
      }

      const origMonthly = new Set<string>();
      (avData || []).forEach((r: MonthlyAvailabilityRow) => {
        origMonthly.add(`${r.date}|${r.horario_id}`);
      });
      setOriginalMonthly(origMonthly);
      setMonthlyDraft(new Set(origMonthly));

      // extras do mês
      const { data: exData, error: exErr } = await supabase
        .from("extras")
        .select("*")
        .eq("active", true)
        .gte("event_date", start)
        .lte("event_date", end)
        .order("event_date", { ascending: true })
        .order("time", { ascending: true });

      if (exErr) {
        console.error(exErr);
        setError("Não foi possível carregar as missas extras.");
        setLoadingMonth(false);
        return;
      }

      const extrasList = (exData || []) as Extra[];
      setExtras(extrasList);

      const extraIds = extrasList.map((e) => e.id);
      let origExtras = new Set<number>();
      if (extraIds.length > 0) {
        const { data: aexData, error: aexErr } = await supabase
          .from("availability_extras")
          .select("extra_id")
          .eq("minister_id", selectedMinisterId)
          .in("extra_id", extraIds);

        if (aexErr) {
          console.error(aexErr);
          setError("Não foi possível carregar disponibilidade extras.");
          setLoadingMonth(false);
          return;
        }

        origExtras = new Set(
          (aexData || []).map((r: any) => r.extra_id as number)
        );
      }

      setOriginalExtras(origExtras);
      setExtrasDraft(new Set(origExtras));

      // contagens fixas
      const { data: countData } = await supabase.rpc(
        "get_slot_availability_counts",
        { start_date: start, end_date: end }
      );
      const slotMap: Record<string, number> = {};
      (countData || []).forEach((r: any) => {
        const key = `${r.date}|${r.horario_id}`;
        slotMap[key] = r.total;
      });
      setSlotCounts(slotMap);

      // contagens extras
      const { data: exCountData } = await supabase.rpc(
        "get_extra_availability_counts",
        { start_date: start, end_date: end }
      );
      const exMap: Record<number, number> = {};
      (exCountData || []).forEach((r: any) => {
        exMap[r.extra_id] = r.total;
      });
      setExtraCounts(exMap);

      // define dia inicial
      const daysInMonth = lastDayOfMonth.getDate();
      let initial: string | null = null;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(year, month, d);
        const wd = dt.getDay();
        const dtStr = formatDate(dt);
        if (
          (horariosPorWeekday[wd] && horariosPorWeekday[wd].length > 0) ||
          extrasByDate[dtStr]
        ) {
          initial = dtStr;
          break;
        }
      }
      setSelectedDate(null);

      setLoadingMonth(false);
    };

    loadMonth();
  }, [
    selectedMinisterId,
    year,
    month,
    horarios.length,
    firstDayOfMonth,
    lastDayOfMonth,
    horariosPorWeekday,
  ]);

  // ========= TOGGLES =========

  const toggleDraftMonthly = (date: string, horarioId: number) => {
    if (!canEditSelectedMonth || savingAll) return;
    // NOVA VERIFICAÇÃO DE BLOQUEIO
  const blocked = blockedMasses.find(b => b.date === date);
  if (blocked && blocked.blocked_times) {
    const horario = horarios.find(h => h.id === horarioId);
    if (horario && blocked.blocked_times.includes(horario.time)) {
      setError(`Este horário está bloqueado. Motivo: ${blocked.reason || 'Sem motivo especificado'}`);
      return;
    }
  }
    const key = `${date}|${horarioId}`;
    const next = new Set(monthlyDraft);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setMonthlyDraft(next);
  };

  const toggleDraftExtra = (extraId: number) => {
    if (!canEditSelectedMonth || savingAll) return;

    // NOVA VERIFICAÇÃO DE BLOQUEIO
  const extra = extras.find(e => e.id === extraId);
  if (extra) {
    const blocked = blockedMasses.find(b => b.date === extra.event_date);
    if (blocked && blocked.blocked_times && blocked.blocked_times.includes(extra.time)) {
      setError(`Este horário está bloqueado. Motivo: ${blocked.reason || 'Sem motivo especificado'}`);
      return;
    }
  }
    const next = new Set(extrasDraft);
    if (next.has(extraId)) next.delete(extraId);
    else next.add(extraId);
    setExtrasDraft(next);
  };

  // ========= BUSCA DE MINISTRO =========

  const handleMinisterSearchChange = (value: string) => {
    setMinisterSearch(value);
    const term = value.trim().toLowerCase();
    if (!term) return;
    const found = ministers.find((m) =>
      m.name.toLowerCase().includes(term)
    );
    if (found) {
      setSelectedMinisterId(found.id);
    }
  };

  // ========= RECORRÊNCIA =========

  const horariosForRecWeekday = useMemo(() => {
    if (recWeekday === "") return [];
    return horarios.filter((h) => h.active && h.weekday === recWeekday);
  }, [recWeekday, horarios]);

  const applyRecurrence = (mode: "set" | "clear") => {
    if (!canEditSelectedMonth || savingAll) return;
    if (recWeekday === "" || recHorarioId === "") return;

    const horarioId = recHorarioId as number;
    const next = new Set(monthlyDraft);
    const daysInMonth = lastDayOfMonth.getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      if (dt.getDay() === recWeekday) {
        const date = formatDate(dt);
        const key = `${date}|${horarioId}`;
        if (mode === "set") next.add(key);
        else next.delete(key);
      }
    }

    setMonthlyDraft(next);
    setInfo(
      mode === "set"
        ? "Recorrência aplicada para o mês."
        : "Recorrência removida."
    );
    setError(null);
  };
  // ========= DIFERENÇAS =========

  const buildChanges = () => {
    const toInsertMonthly: { date: string; horario_id: number }[] = [];
    const toDeleteMonthly: { date: string; horario_id: number }[] = [];
    const toInsertExtras: number[] = [];
    const toDeleteExtras: number[] = [];

    const allMonthlyKeys = new Set([
      ...Array.from(originalMonthly),
      ...Array.from(monthlyDraft),
    ]);

    allMonthlyKeys.forEach((key) => {
      const [date, hidStr] = key.split("|");
      const horario_id = Number(hidStr);
      const had = originalMonthly.has(key);
      const hasNow = monthlyDraft.has(key);
      if (!had && hasNow) toInsertMonthly.push({ date, horario_id });
      if (had && !hasNow) toDeleteMonthly.push({ date, horario_id });
    });

    const allExtraIds = new Set([
      ...Array.from(originalExtras),
      ...Array.from(extrasDraft),
    ]);

    allExtraIds.forEach((id) => {
      const had = originalExtras.has(id);
      const hasNow = extrasDraft.has(id);
      if (!had && hasNow) toInsertExtras.push(id);
      if (had && !hasNow) toDeleteExtras.push(id);
    });

    return { toInsertMonthly, toDeleteMonthly, toInsertExtras, toDeleteExtras };
  };

  // ========= SALVAR =========

  const saveChanges = async (): Promise<boolean> => {
    if (!selectedMinisterId) return false;

    const {
      toInsertMonthly,
      toDeleteMonthly,
      toInsertExtras,
      toDeleteExtras,
    } = buildChanges();

    if (
      toInsertMonthly.length === 0 &&
      toDeleteMonthly.length === 0 &&
      toInsertExtras.length === 0 &&
      toDeleteExtras.length === 0
    ) {
      return true;
    }

    setSavingAll(true);
    setError(null);
    setInfo(null);

    const horarioById = new Map(horarios.map((h) => [h.id, h]));
    const extrasById = new Map(extras.map((e) => [e.id, e]));

    const tempSlotCounts = { ...slotCounts };
    const tempExtraCounts = { ...extraCounts };

    // libera vagas removidas
    toDeleteMonthly.forEach(({ date, horario_id }) => {
      const key = `${date}|${horario_id}`;
      if (tempSlotCounts[key] !== undefined) {
        tempSlotCounts[key] = Math.max(0, tempSlotCounts[key] - 1);
      }
    });

    toDeleteExtras.forEach((extra_id) => {
      if (tempExtraCounts[extra_id] !== undefined) {
        tempExtraCounts[extra_id] = Math.max(0, tempExtraCounts[extra_id] - 1);
      }
    });

    // checa inserções normais
    for (const { date, horario_id } of toInsertMonthly) {
      const h = horarioById.get(horario_id);
      if (!h) continue;
      const key = `${date}|${horario_id}`;
      const current = tempSlotCounts[key] || 0;
      if (current + 1 > h.max_allowed) {
        setSavingAll(false);
        setError(
          `Limite máximo atingido para ${date} às ${h.time.slice(
            0,
            5
          )}h. Ajuste suas escolhas.`
        );
        return false;
      }
      tempSlotCounts[key] = current + 1;
    }

    // checa inserções extras
    for (const extra_id of toInsertExtras) {
      const ex = extrasById.get(extra_id);
      if (!ex) continue;
      const current = tempExtraCounts[extra_id] || 0;
      if (current + 1 > ex.max_allowed) {
        setSavingAll(false);
        setError(
          `Limite máximo atingido para a missa extra "${ex.title}" em ${ex.event_date}.`
        );
        return false;
      }
      tempExtraCounts[extra_id] = current + 1;
    }

    try {
      // deletar fixos
      for (const { date, horario_id } of toDeleteMonthly) {
        await supabase
          .from("monthly_availability_regular")
          .delete()
          .eq("minister_id", selectedMinisterId)
          .eq("date", date)
          .eq("horario_id", horario_id);
      }

      // inserir fixos
      if (toInsertMonthly.length > 0) {
        const rows = toInsertMonthly.map(({ date, horario_id }) => ({
          minister_id: selectedMinisterId,
          date,
          horario_id,
        }));
        await supabase.from("monthly_availability_regular").insert(rows);
      }

      // deletar extras
      for (const extra_id of toDeleteExtras) {
        await supabase
          .from("availability_extras")
          .delete()
          .eq("minister_id", selectedMinisterId)
          .eq("extra_id", extra_id);
      }

      // inserir extras
      if (toInsertExtras.length > 0) {
        const rows = toInsertExtras.map((extra_id) => ({
          minister_id: selectedMinisterId,
          extra_id,
        }));
        await supabase.from("availability_extras").insert(rows);
      }

      setOriginalMonthly(new Set(monthlyDraft));
      setOriginalExtras(new Set(extrasDraft));
      setSlotCounts(tempSlotCounts);
      setExtraCounts(tempExtraCounts);
      setInfo("Disponibilidade salva com sucesso.");
      setSavingAll(false);
      return true;
    } catch (e: any) {
      console.error(e);
      setError("Erro ao salvar. Tente novamente.");
      setSavingAll(false);
      return false;
    }
  };

  // ========= MODAIS & NAVEGAÇÃO =========

  const openConfirm = () => {
    if (!hasPendingChanges) {
      setInfo("Nenhuma alteração para confirmar.");
      return;
    }
    setShowConfirm(true);
    setInfo(null);
    setError(null);
  };

  const handleConfirmOnly = async () => {
    const ok = await saveChanges();
    if (ok) setShowConfirm(false);
  };

  const handleConfirmAndNavigate = async () => {
    if (!pendingNav) return;
    const ok = await saveChanges();
    if (!ok) return;
    const { to, replace } = pendingNav;
    setShowNavConfirm(false);
    setPendingNav(null);
    if (replace) navigate(to, { replace: true });
    else navigate(to);
  };

  const handleDiscardAndNavigate = () => {
    if (!pendingNav) {
      setShowNavConfirm(false);
      return;
    }
    const { to, replace } = pendingNav;
    setMonthlyDraft(new Set(originalMonthly));
    setExtrasDraft(new Set(originalExtras));
    setShowNavConfirm(false);
    setPendingNav(null);
    if (replace) navigate(to, { replace: true });
    else navigate(to);
  };

  const handleStayOnPage = () => {
    setShowNavConfirm(false);
    setPendingNav(null);
  };

  // ========= RENDER =========

  if (loadingBase || !me) {
    return (
      <div className="max-w-5xl mx-auto">
        <h2 className="text-lg font-semibold text-[#4A6FA5] mb-2">
          Disponibilidade Mensal
        </h2>
        <p className="text-sm text-gray-600">Carregando informações...</p>
      </div>
    );
  }
{/* ================= RECORRÊNCIA ================= */}
{canEditSelectedMonth && (
  <div className="bg-white border border-gray-200 rounded-2xl p-3 text-[9px] space-y-2">

    <div className="flex flex-col sm:flex-row sm:items-end gap-2">

      {/* Dia da semana */}
      <div className="flex-1">
        <label className="block text-[9px] text-gray-600 mb-1">
          Recorrência - Dia da semana
        </label>
        <select
          className="w-full border rounded px-2 py-1"
          value={recWeekday === "" ? "" : recWeekday}
          onChange={(e) =>
            setRecWeekday(
              e.target.value === "" ? "" : Number(e.target.value)
            )
          }
        >
          <option value="">Selecione</option>
          {WEEKDAYS_FULL.map((w, idx) => (
            <option key={idx} value={idx}>
              {w}
            </option>
          ))}
        </select>
      </div>

      {/* Horário */}
      <div className="flex-1">
        <label className="block text-[9px] text-gray-600 mb-1">
          Horário fixo
        </label>
        <select
          className="w-full border rounded px-2 py-1"
          value={recHorarioId === "" ? "" : recHorarioId}
          onChange={(e) =>
            setRecHorarioId(
              e.target.value === "" ? "" : Number(e.target.value)
            )
          }
          disabled={
            recWeekday === "" || horariosForRecWeekday.length === 0
          }
        >
          <option value="">Selecione</option>
          {horariosForRecWeekday.map((h) => (
            <option key={h.id} value={h.id}>
              {WEEKDAYS_FULL[h.weekday]} — {h.time.slice(0, 5)}h
            </option>
          ))}
        </select>
      </div>

      {/* Botões */}
      <div className="flex flex-col sm:flex-row gap-1 sm:ml-2">
        <button
          onClick={() => applyRecurrence("set")}
          disabled={
            recWeekday === "" || recHorarioId === "" || savingAll
          }
          className="px-3 py-1.5 rounded-full bg-[#7C3AED] text-white text-[9px] hover:bg-[#6D28D9] disabled:opacity-50"
        >
          Aplicar no mês
        </button>

        <button
          onClick={() => applyRecurrence("clear")}
          disabled={
            recWeekday === "" || recHorarioId === "" || savingAll
          }
          className="px-3 py-1.5 rounded-full border border-gray-300 text-[9px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Limpar recorrência
        </button>
      </div>
    </div>

    <p className="text-[8px] text-gray-500">
      Exemplo: "Todas as segundas às 11h30" — escolha o dia,
      selecione o horário e clique em "Aplicar no mês".
    </p>
  </div>
)}
  const currentMinister =
    ministers.find((m) => m.id === selectedMinisterId) || me;

  let dayHorarios: Horario[] = [];
  let dayExtras: Extra[] = [];
  let selectedDateObj: Date | null = null;
  let weekdayLabel = "";

  if (selectedDate) {
    selectedDateObj = new Date(selectedDate + "T00:00:00");
    const wd = selectedDateObj.getDay();
    weekdayLabel = WEEKDAYS_FULL[wd];
    dayHorarios = horariosPorWeekday[wd] || [];
    dayExtras = extrasByDate[selectedDate] || [];
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1E3A6E]">Disponibilidade</h2>
          <p className="text-xs text-gray-500 mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex gap-1.5">
          <select className="border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm font-medium bg-white focus:border-[#4A6FA5] focus:outline-none"
            value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((name, idx) => <option key={idx} value={idx}>{name}</option>)}
          </select>
          <select className="border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm font-medium bg-white w-20 focus:border-[#4A6FA5] focus:outline-none"
            value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 10 }).map((_, i) => { const y = new Date().getFullYear() - 2 + i; return <option key={y} value={y}>{y}</option>; })}
          </select>
        </div>
      </div>

      {/* Banner de janela */}
      <div className={`rounded-2xl px-4 py-3 text-sm flex items-start gap-3 ${
        canEditSelectedMonth
          ? "bg-green-50 border-2 border-green-200 text-green-800"
          : "bg-amber-50 border-2 border-amber-200 text-amber-800"
      }`}>
        <span className="text-lg flex-shrink-0">{canEditSelectedMonth ? "✅" : "🔒"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{windowMessage}</p>
          {isAdmin && <p className="text-xs mt-0.5 opacity-70">Config. em Relatórios › Janela de disponibilidade</p>}
        </div>
      </div>

      {/* Seleção de ministro (admin) */}
      {isAdmin && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Editando disponibilidade de:
          </label>
          <input type="text" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm mb-2 focus:border-[#4A6FA5] focus:outline-none"
            placeholder="Buscar ministro..." value={ministerSearch}
            onChange={(e) => handleMinisterSearchChange(e.target.value)} />
          <select className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-[#4A6FA5] focus:outline-none"
            value={selectedMinisterId || ""} onChange={(e) => setSelectedMinisterId(e.target.value)}>
            {ministers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.is_admin ? " (Admin)" : ""}</option>
            ))}
          </select>
        </div>
      )}

      {/* Erros / infos */}
      {error && <div className="text-sm text-red-600 bg-red-50 border-2 border-red-200 px-4 py-3 rounded-2xl flex items-center gap-2"><span>⚠️</span>{error}</div>}
      {info && <div className="text-sm text-green-700 bg-green-50 border-2 border-green-200 px-4 py-3 rounded-2xl flex items-center gap-2"><span>✅</span>{info}</div>}

      {/* Recorrência */}
      {canEditSelectedMonth && (
        <div className="bg-gradient-to-r from-[#FFF7EC] to-[#FFFBF5] border-2 border-[#FCD9A5] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">⚡</span>
            <p className="text-sm font-bold text-[#EA580C]">Preenchimento rápido</p>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-xs font-semibold text-[#EA580C] mb-1.5">Dia da semana</label>
              <select className="w-full border-2 border-[#FCD9A5] rounded-xl px-2 py-2 text-sm bg-white focus:outline-none"
                value={recWeekday === "" ? "" : recWeekday}
                onChange={(e) => setRecWeekday(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">Selecione</option>
                {WEEKDAYS_FULL.map((w, idx) => <option key={idx} value={idx}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#EA580C] mb-1.5">Horário fixo</label>
              <select className="w-full border-2 border-[#FCD9A5] rounded-xl px-2 py-2 text-sm bg-white focus:outline-none"
                value={recHorarioId === "" ? "" : recHorarioId}
                onChange={(e) => setRecHorarioId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={recWeekday === "" || horariosForRecWeekday.length === 0}>
                <option value="">Selecione</option>
                {horariosForRecWeekday.map((h) => (
                  <option key={h.id} value={h.id}>{WEEKDAYS_FULL[h.weekday]} — {h.time.slice(0, 5)}h</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => applyRecurrence("set")} disabled={recWeekday === "" || recHorarioId === "" || savingAll}
              className="flex-1 py-2.5 rounded-xl bg-[#F97316] text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform">
              Aplicar no mês
            </button>
            <button onClick={() => applyRecurrence("clear")} disabled={recWeekday === "" || recHorarioId === "" || savingAll}
              className="flex-1 py-2.5 rounded-xl border-2 border-[#FCD9A5] text-[#EA580C] text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform">
              Limpar
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Ex: "Todos os domingos às 08:30h" → selecione e toque em Aplicar.</p>
        </div>
      )}

      {/* CALENDÁRIO */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-[#1E3A6E] to-[#4A6FA5] px-4 py-3">
          <div className="grid grid-cols-7 text-center">
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
                const d = new Date(date + "T00:00:00");
                const wd = d.getDay();
                const hs = horariosPorWeekday[wd] || [];
                const hasHorario = hs.length > 0;
                const hasExtras = !!extrasByDate[date];
                const hasFixedSelection = hasHorario && hs.some((h) => monthlyDraft.has(`${date}|${h.id}`));
                const hasExtraSelection = hasExtras && (extrasByDate[date] || []).some((e) => extrasDraft.has(e.id));
                const hasSelection = hasFixedSelection || hasExtraSelection;
                const isDisabled = !hasHorario && !hasExtras;
                const isSelected = selectedDate === date;
                const isBlocked = blockedDates.has(date);
                // Só ofusca se bloqueado E não tiver missas solenes (extras) no dia
                const shouldDim = isBlocked && !hasExtras;

                return (
                  <button key={date}
                    onClick={() => { if (!isDisabled) setSelectedDate(date); }}
                    className={`h-11 rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 ${
                      isDisabled
                        ? "bg-transparent text-gray-200 cursor-default"
                        : isSelected
                        ? "bg-[#4A6FA5] shadow-md shadow-blue-200 ring-2 ring-[#4A6FA5] ring-offset-1"
                        : hasSelection
                        ? "bg-green-50 border-2 border-green-400"
                        : "bg-gray-50 border border-gray-200 hover:border-blue-300"
                    } ${shouldDim ? "opacity-40" : ""}`}
                  >
                    <span className={`text-sm font-bold leading-none ${
                      isSelected ? "text-white" : isDisabled ? "text-gray-300" : "text-gray-700"
                    }`}>{cell.day}</span>
                    <div className="flex gap-0.5 mt-0.5">
                      {hasSelection && !isSelected && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                      {hasExtras && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                      {isBlocked && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-[#4A6FA5]" />Selecionado</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500" />Marcado</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-purple-500" />Extra</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-red-500" />Contêm horários bloqueados</span>
        </div>
      </div>

      {/* MODAL CENTRAL */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">

            {/* Handle mobile */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Cabeçalho modal */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#1E3A6E]">
                  {weekdayLabel}
                </h3>
                <p className="text-xs text-gray-500">{selectedDate.split("-").reverse().join("/")}</p>
              </div>
              <button onClick={() => setSelectedDate(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg font-bold">
                ×
              </button>
            </div>

            {/* Conteúdo */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {dayHorarios.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Missas Fixas</h4>
                  <div className="space-y-2">
                    {dayHorarios.map((h) => {
                      const extraSameTime = dayExtras.some((e) => e.time === h.time);
                      if (extraSameTime) return null;
                      const key = `${selectedDate}|${h.id}`;
                      const checked = monthlyDraft.has(key);
                      const count = slotCounts[key] || 0;
                      const blocked = blockedMasses.find(b => b.date === selectedDate);
                      const isBlocked = blocked && blocked.blocked_times && blocked.blocked_times.includes(h.time);
                      return (
                        <label key={h.id} className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                          isBlocked ? "bg-red-50 border-red-200 opacity-60 cursor-not-allowed"
                          : checked ? "bg-[#EEF4FF] border-[#4A6FA5]"
                          : "bg-gray-50 border-gray-200 hover:border-gray-300"
                        }`}>
                          <input type="checkbox" className="w-5 h-5 accent-[#4A6FA5] flex-shrink-0"
                            checked={checked} onChange={() => toggleDraftMonthly(selectedDate, h.id)}
                            disabled={!canEditSelectedMonth || !!isBlocked} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800">
                              {h.time.slice(0, 5)}h
                              {isBlocked && <span className="ml-2 text-xs text-red-600 font-semibold">Bloqueado</span>}
                            </p>
                            <p className="text-xs text-gray-500">
                              {isBlocked ? <span className="text-red-400 italic">Não haverá missa{blocked!.reason ? ` — ${blocked!.reason}` : ""}</span> : `Mín ${h.min_required} · Máx ${h.max_allowed} · Atual ${count}`}
                            </p>
                          </div>
                          {checked && !isBlocked && <span className="text-[#4A6FA5] font-bold text-lg flex-shrink-0">✓</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {dayExtras.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-purple-500 uppercase tracking-wide mb-2">Missas Solenes</h4>
                  <div className="space-y-2">
                    {dayExtras.map((e) => {
                      const checked = extrasDraft.has(e.id);
                      const count = extraCounts[e.id] || 0;
                      const blocked = blockedMasses.find(b => b.date === selectedDate);
                      const isBlocked = blocked && blocked.blocked_times && blocked.blocked_times.includes(e.time);
                      return (
                        <label key={e.id} className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                          isBlocked ? "bg-red-50 border-red-200 opacity-60 cursor-not-allowed"
                          : checked ? "bg-purple-50 border-purple-400"
                          : "bg-purple-50/30 border-purple-200 hover:border-purple-300"
                        }`}>
                          <input type="checkbox" className="w-5 h-5 accent-purple-600 flex-shrink-0"
                            checked={checked} onChange={() => toggleDraftExtra(e.id)}
                            disabled={!canEditSelectedMonth || !!isBlocked} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-purple-700">
                              {e.time.slice(0, 5)}h · {e.title}
                              {isBlocked && <span className="ml-2 text-xs text-red-600 font-semibold">Bloqueado</span>}
                            </p>
                            <p className="text-xs text-gray-500">
                              {isBlocked ? <span className="text-red-400 italic">Não haverá missa{blocked!.reason ? ` — ${blocked!.reason}` : ""}</span> : `Mín ${e.min_required} · Máx ${e.max_allowed} · Atual ${count}`}
                            </p>
                          </div>
                          {checked && !isBlocked && <span className="text-purple-600 font-bold text-lg flex-shrink-0">✓</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {dayHorarios.length === 0 && dayExtras.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-2xl mb-2">📅</p>
                  <p className="text-sm">Nenhum horário para este dia.</p>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={() => setSelectedDate(null)}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] text-white text-sm font-bold shadow-md shadow-blue-100 active:scale-95 transition-transform">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar alterações */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-5">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h3 className="text-base font-bold text-[#1E3A6E] mb-2">Salvar alterações?</h3>
            <p className="text-sm text-gray-600 mb-5">Deseja confirmar as marcações para este mês?</p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleConfirmOnly}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] text-white text-sm font-bold shadow-sm">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar navegação */}
      {showNavConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-5">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h3 className="text-base font-bold text-[#1E3A6E] mb-2">Sair sem salvar?</h3>
            <p className="text-sm text-gray-600 mb-5">Você tem alterações não salvas. O que deseja fazer?</p>
            <div className="flex flex-col gap-2">
              <button onClick={handleConfirmAndNavigate}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] text-white text-sm font-bold">
                Salvar e sair
              </button>
              <button onClick={handleDiscardAndNavigate}
                className="w-full py-3 rounded-2xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">
                Descartar e sair
              </button>
              <button onClick={handleStayOnPage}
                className="w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">
                Permanecer na página
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RODAPÉ FIXO */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t-2 border-gray-100 p-3 rounded-t-2xl shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {hasPendingChanges ? (
              <p className="text-xs font-semibold text-amber-600 truncate">⚡ Alterações pendentes — não esqueça de confirmar!</p>
            ) : (
              <p className="text-xs text-gray-400">Nenhuma alteração pendente</p>
            )}
          </div>
          <button onClick={openConfirm} disabled={!hasPendingChanges || savingAll}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all flex-shrink-0 ${
              hasPendingChanges
                ? "bg-gradient-to-r from-[#2756A3] to-[#4A6FA5] shadow-md shadow-blue-100 active:scale-95"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}>
            {savingAll ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>

    </div>
  );
}
