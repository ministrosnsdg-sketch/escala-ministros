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
    <div className="max-w-5xl mx-auto space-y-3">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[#4A6FA5]">
            Disponibilidade Mensal
          </h2>
          <p className="text-[10px] text-gray-700">
            Selecione os dias e horários. Suas escolhas só valem após confirmação.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
  className="border rounded px-2 py-1 text-[10px]"
  value={month}
  onChange={(e) => setMonth(Number(e.target.value))}
>
  {MONTH_NAMES.map((name, idx) => (
    <option key={idx} value={idx}>
      {name}
    </option>
  ))}
</select>

<select
  className="border rounded px-2 py-1 text-[10px] w-20"
  value={year}
  onChange={(e) => setYear(Number(e.target.value))}
>
  {Array.from({ length: 10 }).map((_, i) => {
    const y = new Date().getFullYear() - 2 + i; // 2 anos antes, 7 depois (ajustável)
    return (
      <option key={y} value={y}>
        {y}
      </option>
    );
  })}
</select>
        </div>
      </div>

      {/* Info da janela */}
      <div className="bg-[#F7FAFF] border border-[#D6E6F7] rounded-xl px-3 py-2 text-[9px] text-[#3F5F8F] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div>{windowMessage}</div>
        {isAdmin && (
          <div className="text-[8px] text-gray-500">
            (Config. em Relatórios &gt; Janela de disponibilidade)
          </div>
        )}
      </div>

      {/* Seleção ministro */}
      {isAdmin && (
        <div className="mb-1">
          <label className="block text-[9px] text-gray-600 mb-1">
            Editando disponibilidade de:
          </label>
          <input
            type="text"
            className="border rounded px-2 py-1 text-[10px] w-full mb-1"
            placeholder="Buscar ministro..."
            value={ministerSearch}
            onChange={(e) => handleMinisterSearchChange(e.target.value)}
          />
          <select
            className="border rounded px-2 py-1 text-[10px] min-w-[220px]"
            value={selectedMinisterId || ""}
            onChange={(e) => setSelectedMinisterId(e.target.value)}
          >
            {ministers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.is_admin ? "(Admin)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ERROS / INFOS */}
      {error && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {error}
        </div>
      )}
      {info && (
        <div className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded">
          {info}
        </div>
      )}
{/* ================= RECORRÊNCIA ================= */}
{canEditSelectedMonth && (
  <div className="bg-[#FFF7EC] border border-[#FCD9A5] rounded-2xl p-3 text-[9px] space-y-2">

    <div className="flex flex-col sm:flex-row sm:items-end gap-2">

      {/* Dia da semana */}
      <div className="flex-1">
        <label className="block text-[9px] text-[#EA580C] mb-1">
          Recorrência — Dia da semana
        </label>
        <select
          className="w-full border border-[#FCD9A5] rounded px-2 py-1 text-[10px]"
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
        <label className="block text-[9px] text-[#EA580C] mb-1">
          Horário fixo
        </label>
        <select
          className="w-full border border-[#FCD9A5] rounded px-2 py-1 text-[10px]"
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

        {/* Aplicar */}
        <button
          onClick={() => applyRecurrence("set")}
          disabled={
            recWeekday === "" || recHorarioId === "" || savingAll
          }
          className="px-3 py-1.5 rounded-full bg-[#F97316] text-white text-[9px] hover:bg-[#EA580C] disabled:opacity-50"
        >
          Aplicar no mês
        </button>

        {/* Limpar */}
        <button
          onClick={() => applyRecurrence("clear")}
          disabled={
            recWeekday === "" || recHorarioId === "" || savingAll
          }
          className="px-3 py-1.5 rounded-full border border-[#FCD9A5] text-[9px] text-[#EA580C] hover:bg-[#FFF1E0] disabled:opacity-50"
        >
          Limpar recorrência
        </button>

      </div>
    </div>

    <p className="text-[8px] text-gray-500">
      Exemplo: “Todas as segundas às 11h30” — selecione dia e hora e clique.
    </p>
  </div>
)}

      {/* CALENDÁRIO */}
      <div className="bg-white border border-gray-200 rounded-2xl p-3">
        <div className="text-center mb-2">
          <div className="inline-block px-6 py-1.5 rounded-full bg-[#2756A3] text-white text-[11px] font-semibold">
            {monthLabel.toUpperCase()}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[9px] font-semibold text-[#2756A3]">
          {WEEKDAYS_SHORT.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
          {daysMatrix.map((week, wi) =>
            week.map((cell, ci) => {
              if (!cell.date || cell.day === null) {
                return (
                  <div key={`${wi}-${ci}`} className="h-8 rounded-lg" />
                );
              }

              const date = cell.date;
              const d = new Date(date + "T00:00:00");
              const wd = d.getDay();

              const hs = horariosPorWeekday[wd] || [];
              const hasHorario = hs.length > 0;
              const hasExtras = !!extrasByDate[date];

              const hasFixedSelection =
                hasHorario &&
                hs.some((h) => monthlyDraft.has(`${date}|${h.id}`));

              const hasExtraSelection =
                hasExtras &&
                (extrasByDate[date] || []).some((e) =>
                  extrasDraft.has(e.id)
                );

              const hasSelection = hasFixedSelection || hasExtraSelection;

              const isDisabled = !hasHorario && !hasExtras;
              const isSelected = selectedDate === date;

              const base =
                "h-8 flex flex-col items-center justify-center rounded-lg border text-[10px] transition-colors";
              let cls =
                "border-gray-200 bg-white text-gray-800 cursor-pointer hover:bg-[#EEF4FF]";

              if (isDisabled) {
                cls =
                  "border-transparent bg-gray-50 text-gray-300 cursor-default";
              }

              if (isSelected && !isDisabled) {
                cls =
                  "border-[#2756A3] bg-white text-[#2756A3] font-semibold shadow-sm";
              }

              return (
                <button
                  key={date}
                  onClick={() => {
                    setSelectedDate(date);
                  }}
                  className={`${base} ${cls}`}
                >
                  <span>{cell.day}</span>
                  <div className="mt-[1px] flex gap-[2px]">
  {hasSelection && (
    <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
  )}
  {hasExtras && (
    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
  )}
  {blockedDates.has(date) && (
    <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
  )}
</div>
                </button>
              );
            })
          )}
        </div>

        {/* LEGENDA */}
        <div className="mt-3 flex flex-wrap gap-3 text-[8px] text-gray-600">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
            <span>Dia com horários marcados</span>
          </div> 
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-600" />
            <span>Dia com missa extra</span>
            <div className="flex items-center gap-1">
  <span className="w-2 h-2 rounded-full bg-red-600" />
  <span>Dia com horários bloqueados</span>
</div>
          </div>
        </div>
      </div>

      {/* ========= MODAL CENTRAL ========= */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-3">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-gray-200 p-4">

            {/* Cabeçalho modal */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-[#4A6FA5]">
                  {weekdayLabel} — {selectedDate.split("-").reverse().join("/")}
                </h3>
                <p className="text-[10px] text-gray-600">
                  Marque os horários desejados.
                </p>
              </div>

              <button
                onClick={() => setSelectedDate(null)}
                className="text-[10px] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                Fechar
              </button>
            </div>

            {/* Conteúdo modal */}
            <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">

              {/* Horários Fixos (OCULTA quando houver missa extra no mesmo horário) */}
{dayHorarios.length > 0 && (
  <div>
    <h4 className="text-xs font-semibold text-gray-700 mb-1">
      Missas Fixas
    </h4>

    <div className="space-y-2">
      {dayHorarios.map((h) => {
  const extraSameTime = dayExtras.some(
    (e) => e.time === h.time
  );

  if (extraSameTime) {
    return null;
  }

  const key = `${selectedDate}|${h.id}`;
  const checked = monthlyDraft.has(key);
  const count = slotCounts[key] || 0;
  
  // VERIFICAR SE ESTÁ BLOQUEADO
  const blocked = blockedMasses.find(b => b.date === selectedDate);
  const isBlocked = blocked && blocked.blocked_times && blocked.blocked_times.includes(h.time);

  return (
    <div
      key={h.id}
      className={`flex items-center justify-between border rounded-lg px-3 py-2 ${isBlocked ? 'bg-red-50 border-red-300 opacity-60' : 'bg-gray-50'}`}
    >
      <div>
        <div className="text-[11px] font-semibold">
          {h.time.slice(0, 5)}h
          {isBlocked && <span className="ml-2 text-red-600 text-[9px]">NÃO HAVERÁ MISSA</span>}
        </div>
        <div className="text-[9px] text-gray-600">
          {isBlocked ? `Motivo: ${blocked.reason || 'Não especificado'}` : `Min ${h.min_required} • Máx ${h.max_allowed} • Atual ${count}`}
        </div>
      </div>

      <input
        type="checkbox"
        className="w-4 h-4"
        checked={checked}
        onChange={() => toggleDraftMonthly(selectedDate, h.id)}
        disabled={!canEditSelectedMonth || isBlocked}
      />
    </div>
  );
})}
    </div>
  </div>
)}
{/* Missas Extras */}
              {dayExtras.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-purple-700 mb-1">
                    Missas Extras
                  </h4>

                  <div className="space-y-2">
                    {dayExtras.map((e) => {
  const checked = extrasDraft.has(e.id);
  const count = extraCounts[e.id] || 0;
  
  // VERIFICAR SE ESTÁ BLOQUEADO
  const blocked = blockedMasses.find(b => b.date === selectedDate);
  const isBlocked = blocked && blocked.blocked_times && blocked.blocked_times.includes(e.time);

  return (
    <div
      key={e.id}
      className={`flex items-center justify-between border rounded-lg px-3 py-2 ${isBlocked ? 'bg-red-50 border-red-300 opacity-60' : 'bg-purple-50 border-purple-300'}`}
    >
      <div>
        <div className="text-[11px] font-semibold text-purple-700">
          {e.time.slice(0, 5)}h – {e.title}
          {isBlocked && <span className="ml-2 text-red-600 text-[9px]">NÃO HAVERÁ MISSA</span>}
        </div>
        <div className="text-[9px] text-gray-600">
          {isBlocked ? `Motivo: ${blocked.reason || 'Não especificado'}` : `Min ${e.min_required} • Máx ${e.max_allowed} • Atual ${count}`}
        </div>
      </div>

      <input
        type="checkbox"
        className="w-4 h-4 text-purple-700"
        checked={checked}
        onChange={() => toggleDraftExtra(e.id)}
        disabled={!canEditSelectedMonth || isBlocked}
      />
    </div>
  );
})}
                  </div>
                </div>
              )}

              {/* Sem horários */}
              {dayHorarios.length === 0 && dayExtras.length === 0 && (
                <div className="text-[10px] text-gray-600 text-center py-4">
                  Não há horários cadastrados para este dia.
                </div>
              )}
            </div>

            {/* Rodapé modal */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedDate(null)}
                className="text-[10px] px-4 py-2 bg-[#4A6FA5] text-white rounded hover:bg-[#3F5F8F] transition"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========= MODAL DE CONFIRMAÇÃO (Salvar) ========= */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-[#4A6FA5] mb-2">
              Confirmar alterações?
            </h3>
            <p className="text-[10px] text-gray-700 mb-4">
              Você possui alterações não salvas. Deseja confirmar agora?
            </p>

            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="text-[10px] px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmOnly}
                className="text-[10px] px-3 py-1 rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F]"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========= MODAL CONFIRMAR NAVEGAÇÃO ========= */}
      {showNavConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-[#4A6FA5] mb-2">
              Sair sem salvar?
            </h3>
            <p className="text-[10px] text-gray-700 mb-4">
              Há alterações não salvas. Deseja realmente sair?
            </p>

            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={handleStayOnPage}
                className="text-[10px] px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
              >
                Permanecer
              </button>
              <button
                onClick={handleDiscardAndNavigate}
                className="text-[10px] px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Descartar
              </button>
              <button
                onClick={handleConfirmAndNavigate}
                className="text-[10px] px-3 py-1 rounded bg-[#4A6FA5] text-white hover:bg-[#3F5F8F]"
              >
                Salvar e Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========= RODAPÉ — CONFIRMAR ALTERAÇÕES ========= */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-3 rounded-t-xl shadow-inner">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-gray-600">
            {hasPendingChanges
              ? "Alterações pendentes"
              : "Nenhuma alteração pendente"}
          </div>

          <button
            onClick={openConfirm}
            disabled={!hasPendingChanges || savingAll}
            className={`px-4 py-2 rounded text-[11px] text-white transition ${
              hasPendingChanges
                ? "bg-[#4A6FA5] hover:bg-[#3F5F8F]"
                : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            {savingAll ? "Salvando..." : "Confirmar Alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}