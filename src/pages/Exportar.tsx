// src/pages/Exportar.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "../components/Layout";
import { RequireAuth } from "../components/RequireAuth";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

/** Constantes */
const MESES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

const DIAS_LONGO = [
  "DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA",
  "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO",
];

// páginas individuais
const FIXED_DEFAULT_TIMES = ["06:30", "11:30", "19:00"];
const SUNDAY_SPECIAL_TIMES = ["08:30", "11:00"];

/** Utils */
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function formatDateBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function diasDoMes(year: number, month0: number): string[] {
  const last = new Date(year, month0 + 1, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${year}-${pad(month0 + 1)}-${pad(d)}`);
  }
  return out;
}
function isInRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

/** Compactação de nomes */
function compactNames(nomes: string[]): string[] {
  const parts = nomes.map((raw) => {
    const up = (raw || "").toUpperCase().trim();
    const tokens = up.split(/\s+/).filter(Boolean);
    return {
      original: up,
      first: tokens[0] || "",
      last: tokens.length > 1 ? tokens[tokens.length - 1] : "",
    };
  });

  const byFirst: Record<string, number[]> = {};
  parts.forEach((p, i) => {
    if (!p.first) return;
    (byFirst[p.first] ||= []).push(i);
  });

  const result = new Array<string>(parts.length).fill("");

  Object.entries(byFirst).forEach(([first, idxs]) => {
    if (idxs.length === 1) {
      result[idxs[0]] = first;
      return;
    }

    const items = idxs.map((idx) => {
      const p = parts[idx];
      return {
        idx,
        first: p.first,
        last: p.last,
        initial: p.last ? p.last[0] : "",
      };
    });

    const byInitial: Record<string, any[]> = {};
    items.forEach((it) => {
      (byInitial[it.initial || "_"] ||= []).push(it);
    });

    Object.values(byInitial).forEach((bucket) => {
      if (bucket.length === 1) {
        const it = bucket[0];
        result[it.idx] = it.initial ? `${it.first} ${it.initial}.` : it.first;
      } else {
        bucket.sort(
          (a, b) => (a.last || "").length - (b.last || "").length
        );
        bucket.forEach((it, idx) => {
          if (!it.last) result[it.idx] = it.first;
          else if (idx === 0) result[it.idx] = `${it.first} ${it.last}`;
          else result[it.idx] = `${it.first} ${it.initial}.`;
        });
      }
    });
  });

  return result.map((v, i) => v || parts[i].original || "");
}

/** Tipos */
type EscalaEvento = {
  date: string;
  time: string;
  isExtra: boolean;
  tituloExtra: string | null;
  ministros: string[];
};

type EventoCompleto = {
  date: string;
  time: string;
  dow: number;
  labelDia: string;
  labelDiaHora: string;
  isExtra: boolean;
  tituloExtra: string | null;
  ministros: string[];
  groupLabel?: string;
};

type PaginaConfig = {
  key: string;
  label: string;
  include: boolean;
  singleLine: boolean;
  times: string[];
  isCombined?: boolean;
  match: (ev: EscalaEvento) => boolean;
};

/** Renderização dos nomes */
function NamesRow({
  nomes,
  singleLine,
}: {
  nomes: string[];
  singleLine: boolean;
}) {
  const SPLIT_THRESHOLD = 10; // a partir de 11 nomes, divide em duas linhas
  const ref = useRef<HTMLDivElement>(null);
  const compact = useMemo(() => compactNames(nomes), [nomes]);

  // Se tiver mais de SPLIT_THRESHOLD nomes, divide em duas linhas iguais
  const useTwoLines = compact.length > SPLIT_THRESHOLD;

  // Calcular tamanho da fonte baseado na quantidade de nomes (apenas para linha única)
  const fontSize = useMemo(() => {
    if (useTwoLines) return 8.5;
    if (!singleLine) return 10;
    const numNomes = compact.length;
    if (numNomes <= 4) return 10;
    if (numNomes <= 6) return 9;
    if (numNomes <= 8) return 8.5;
    return 8;
  }, [compact.length, singleLine, useTwoLines]);

  useEffect(() => {
    // Aplica ajuste automático de fonte apenas quando é linha única real
    if (useTwoLines || !singleLine || !ref.current) return;
    const el = ref.current;
    const parent = el.parentElement;
    if (!parent) return;
    let size = fontSize;
    el.style.fontSize = `${size}px`;
    el.style.whiteSpace = "nowrap";
    while (el.scrollWidth > parent.clientWidth && size > 7) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [compact, singleLine, fontSize, useTwoLines]);

  if (!compact.length) return <span className="text-gray-500">—</span>;

  // Mais de 10 nomes: divide em duas linhas dentro do mesmo quadro
  if (useTwoLines) {
    const meio = Math.ceil(compact.length / 2);
    const linha1 = compact.slice(0, meio);
    const linha2 = compact.slice(meio);
    return (
      <div className="flex flex-col gap-0.5">
        <div style={{ fontSize: `${fontSize}px` }} className="font-semibold leading-tight">
          {linha1.join(" - ")}
        </div>
        <div style={{ fontSize: `${fontSize}px` }} className="font-semibold leading-tight">
          {linha2.join(" - ")}
        </div>
      </div>
    );
  }

  // Modo multiline explícito (singleLine=false, sem atingir threshold)
  if (!singleLine) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-[10px] font-semibold">
          {compact.join(" - ")}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{ fontSize: `${fontSize}px` }}
      className="font-semibold whitespace-nowrap overflow-hidden"
    >
      {compact.join(" - ")}
    </div>
  );
}

/** Wrapper protegido */
export default function ExportarPage() {
  return (
    <RequireAuth>
      <Layout>
        <ExportarInner />
      </Layout>
    </RequireAuth>
  );
}
function ExportarInner() {
  const [blockedMapState, setBlockedMapState] = useState<
    Map<string, { blocked_times: string[] | null; reason?: string }>
  >(new Map());

  const { user } = useAuth();

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes0, setMes0] = useState(hoje.getMonth());

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [eventos, setEventos] = useState<EscalaEvento[]>([]);

  const [times, setTimes] = useState<string[]>([]);
  const [includedTimes, setIncludedTimes] = useState<Record<string, boolean>>(
    {}
  );

  const [domingoTimes, setDomingoTimes] = useState<string[]>([
    "08:30",
    "11:00",
  ]);
  const [includeDomingos, setIncludeDomingos] = useState(true);
  const [includeMissasSolenes, setIncludeMissasSolenes] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);

  const dias = useMemo(() => diasDoMes(ano, mes0), [ano, mes0]);
  const labelMesAno = `${MESES[mes0]} ${ano}`;

  const printCss = `
  @media print {
    @page { size: A4; margin: 12mm; }
    header, nav, .no-print { display: none !important; }
    /* Oculta banners/avisos do app no PDF (ex: "Preencha sua disponibilidade") */
    [data-app-banner], .app-banner, [role="alert"], [role="status"] { display: none !important; }
    body { background: #ffffff !important; }
    .only-print { display: block !important; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    table.table-black,
    .table-black th,
    .table-black td {
      border: 1px solid #000 !important;
    }

    .zebra thead tr { background: #000 !important; }
    .zebra thead th { color: #fff !important; }
    .zebra tbody tr:nth-child(odd)  { background: #ffffff !important; }
    .zebra tbody tr:nth-child(even) { background: #f0f0f0 !important; }

    .zebra .print-separator { background: #dcdcdc !important; }
    .zebra .print-separator.bg-purple-100 { background: #ede9fe !important; }
    .text-purple-700 { color: #7c3aed !important; }
  }

  @media screen {
    .only-print { display: none; }
    .table-black th, .table-black td { border-color: #000; }
    .zebra tbody tr:nth-child(even) { background: #f7f7f7; }
  }
`;

  /** Verifica admin */
  useEffect(() => {
    async function checkAdmin() {
      if (!user) {
        setIsAdmin(false);
        setLoadingAdmin(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("ministers")
          .select("is_admin")
          .eq("user_id", user.id)
          .single();

        if (error) throw error;
        setIsAdmin(data?.is_admin === true);
      } catch (e) {
        console.error("Erro ao verificar admin:", e);
        setIsAdmin(false);
      } finally {
        setLoadingAdmin(false);
      }
    }
    checkAdmin();
  }, [user]);

  /** Carrega horários */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("horarios")
          .select("time, active, weekday")
          .order("time", { ascending: true });

        let ativos: string[] = [];
        if (!error && data) {
          ativos = (data as any[])
            .filter(
              (h) =>
                h &&
                typeof h.time === "string" &&
                (h.active === true ||
                  h.active === null ||
                  h.active === undefined)
            )
            .map((h) => (h.time as string).slice(0, 5));
        }

        const domingosAtivos = Array.from(
          new Set(
            (data as any[])
              .filter(
                (h) =>
                  h &&
                  h.weekday === 0 &&
                  (h.active === true || h.active == null)
              )
              .map((h) => String(h.time).slice(0, 5))
          )
        ).sort((a, b) => a.localeCompare(b));

        if (domingosAtivos.length) setDomingoTimes(domingosAtivos);
        else setDomingoTimes(["08:30", "11:00"]);

        const all = Array.from(
          new Set([...FIXED_DEFAULT_TIMES, ...ativos])
        ).sort((a, b) => a.localeCompare(b));

        setTimes(all);

        setIncludedTimes((prev) => {
          const next: Record<string, boolean> = {};
          all.forEach((t) => (next[t] = prev[t] ?? true));
          return next;
        });
      } catch (e) {
        console.error("Erro ao carregar horários:", e);
      }
    })();
  }, []);

  /** Carrega escala */
  useEffect(() => {
    if (isAdmin && !loadingAdmin) loadEscala();
  }, [ano, mes0, isAdmin, loadingAdmin]);

  async function loadEscala() {
    setCarregando(true);
    setErro(null);
    setEventos([]);

    const inicio = `${ano}-${pad(mes0 + 1)}-01`;
    const fim = `${ano}-${pad(
      mes0 + 1
    )}-${pad(new Date(ano, mes0 + 1, 0).getDate())}`;

    /** BLOQUEIOS */
    const { data: blockedData } = await supabase
      .from("blocked_masses")
      .select("date, blocked_times, reason")
      .gte("date", inicio)
      .lte("date", fim);

    const tempBlocked = new Map<
      string,
      { blocked_times: string[] | null; reason?: string }
    >();

    (blockedData || []).forEach((b) => {
      tempBlocked.set(b.date, {
        blocked_times: b.blocked_times,
        reason: b.reason,
      });
    });

    setBlockedMapState(tempBlocked);

    try {
      /** HORÁRIOS */
      const { data: hData, error: hErr } = await supabase
        .from("horarios")
        .select("id, time, weekday");

      if (hErr && hErr.code !== "42P01") throw hErr;

      const horarioMap = new Map<number, string>();
      const horarioWeekdayMap = new Map<number, number>();
      (hData || []).forEach((h: any) => {
        if (!h.id || !h.time) return;
        horarioMap.set(h.id, String(h.time).slice(0, 5));
        horarioWeekdayMap.set(h.id, h.weekday as number);
      });

      /** MINISTROS */
      const { data: mData, error: mErr } = await supabase
        .from("ministers")
        .select("id, name, active");

      if (mErr && mErr.code !== "42P01") throw mErr;

      const nomesPorId: Record<string, string> = {};
      (mData || []).forEach((m: any) => {
        if (m.active === false) return;
        if (!m.id || !m.name) return;
        nomesPorId[m.id] = String(m.name).toUpperCase().trim();
      });

      /** EXTRAS */
      const extraInfoMap = new Map<
        number,
        { date: string; time: string; title: string | null }
      >();

      try {
        const { data, error } = await supabase
          .from("extras")
          .select("id, event_date, time, title, active")
          .eq("active", true)
          .gte("event_date", inicio)
          .lte("event_date", fim)
          .order("event_date")
          .order("time");

        if (error && error.code !== "42P01") throw error;

        (data || []).forEach((e: any) => {
          if (!e.id || !e.event_date || !e.time) return;
          extraInfoMap.set(e.id, {
            date: e.event_date,
            time: String(e.time).slice(0, 5),
            title: e.title || null,
          });
        });
      } catch {}
      const extraIds = Array.from(extraInfoMap.keys());

      /** ESCALA FINAL (regular + extras) */
      let escalaReg: any[] = [];
      try {
        const { data, error } = await supabase
          .from("escala_regular")
          .select("date, horario_id, minister_id")
          .gte("date", inicio)
          .lte("date", fim);

        if (error && error.code !== "42P01") throw error;
        escalaReg = data || [];
      } catch {}

      let escalaExt: any[] = [];
      try {
        if (extraIds.length) {
          const { data, error } = await supabase
            .from("escala_extras")
            .select("extra_id, minister_id")
            .in("extra_id", extraIds);

          if (error && error.code !== "42P01") throw error;
          escalaExt = data || [];
        }
      } catch {}

      /** FALLBACK: availability */
      let avReg: any[] = [];
      let avExtras: any[] = [];

      const hasFinal =
        (escalaReg?.length ?? 0) > 0 || (escalaExt?.length ?? 0) > 0;

      if (!hasFinal) {
        try {
          const { data } = await supabase
            .from("monthly_availability_regular")
            .select("minister_id, date, horario_id")
            .gte("date", inicio)
            .lte("date", fim);

          avReg = data || [];
        } catch {}

        try {
          if (extraIds.length) {
            const { data } = await supabase
              .from("availability_extras")
              .select("minister_id, extra_id")
              .in("extra_id", extraIds);

            avExtras = data || [];
          }
        } catch {}
      }

      /** Montagem do mapa final de eventos */
      const mapa: Record<string, EscalaEvento> = {};

      function addEvento(
        date: string,
        time: string,
        ministerId: any,
        isExtra: boolean,
        tituloExtra?: string | null
      ) {
        if (!date || !time || !ministerId) return;
        if (!isInRange(date, inicio, fim)) return;

        const nome = nomesPorId[ministerId];
        if (!nome) return;

        const key = `${date}|${time}|${isExtra ? tituloExtra || "" : ""}`;

        if (!mapa[key]) {
          mapa[key] = {
            date,
            time,
            isExtra,
            tituloExtra: isExtra ? tituloExtra || null : null,
            ministros: [],
          };
        }

        if (!mapa[key].ministros.includes(nome)) {
          mapa[key].ministros.push(nome);
        }
      }

      /** Processa escala final */
      if (hasFinal) {
        escalaReg.forEach((r: any) => {
          const date = r.date;
          // Anti-ghost: validar weekday
          const expectedDow = new Date(date + "T00:00:00").getDay();
          const horarioDow = horarioWeekdayMap.get(r.horario_id);
          if (horarioDow !== undefined && horarioDow !== expectedDow) return;
          const time = horarioMap.get(r.horario_id) || "";
          if (date && time) addEvento(date, time, r.minister_id, false);
        });

        escalaExt.forEach((r: any) => {
          const info = extraInfoMap.get(r.extra_id);
          if (!info) return;
          addEvento(info.date, info.time, r.minister_id, true, info.title);
        });
      } else {
        avReg.forEach((r: any) => {
          const date = r.date;
          // Anti-ghost: validar weekday
          const expectedDow = new Date(date + "T00:00:00").getDay();
          const horarioDow = horarioWeekdayMap.get(r.horario_id);
          if (horarioDow !== undefined && horarioDow !== expectedDow) return;
          const time = horarioMap.get(r.horario_id) || "";
          if (date && time)
            addEvento(date, time, r.minister_id, false);
        });

        avExtras.forEach((r: any) => {
          const info = extraInfoMap.get(r.extra_id);
          if (!info) return;
          addEvento(info.date, info.time, r.minister_id, true, info.title);
        });
      }

      const lista = Object.values(mapa).sort((a, b) =>
        a.date === b.date
          ? a.time.localeCompare(b.time)
          : a.date.localeCompare(b.date)
      );

      setEventos(lista);
    } catch (e: any) {
      console.error("Erro ao carregar escala:", e);
      setEventos([]);
      setErro(
        `Não foi possível carregar a escala para exportação. (Erro: ${
          e?.message || "desconhecido"
        })`
      );
    } finally {
      setCarregando(false);
    }
  }

  /** Selecionar / Limpar */
  function selecionarTodos() {
    const next: Record<string, boolean> = {};
    times.forEach((t) => (next[t] = true));
    setIncludedTimes(next);
    setIncludeDomingos(true);
    setIncludeMissasSolenes(true);
  }

  function limparTodos() {
    const next: Record<string, boolean> = {};
    times.forEach((t) => (next[t] = false));
    setIncludedTimes(next);
    setIncludeDomingos(false);
    setIncludeMissasSolenes(false);
  }

  function handlePrint() {
    if (carregando || loadingAdmin || !isAdmin) return;
    window.print();
  }

  /** Configuração das páginas */
  const paginas: PaginaConfig[] = [
    ...times.map((t) => ({
      key: `time-${t}`,
      label: `MISSAS — ${t}`,
      include: includedTimes[t],
      singleLine: true,
      times: [t],
      match: (ev: EscalaEvento) => {
        const dow = new Date(ev.date + "T00:00:00").getDay();
        return !ev.isExtra && ev.time === t && dow !== 0;
      },
    })),

    {
      key: "domingos",
      label: `DOMINGOS — ${domingoTimes.join(", ")}`,
      include: includeDomingos,
      singleLine: true,
      times: domingoTimes,
      isCombined: true,
      match: (ev: EscalaEvento) => {
        if (ev.isExtra) return false;
        const dow = new Date(ev.date + "T00:00:00").getDay();
        return dow === 0 && domingoTimes.includes(ev.time);
      },
    },

    {
      key: "missas-solenes",
      label: `MISSAS SOLENES / EXTRAS`,
      include: includeMissasSolenes,
      singleLine: true,
      times: [],
      isCombined: true,
      match: (ev: EscalaEvento) => ev.isExtra,
    },
  ];

  /** Verifica se uma data/horário está bloqueado */
  function isHorarioBloqueado(date: string, time: string): boolean {
    const block = blockedMapState.get(date);
    if (!block) return false;
    // Dia inteiro bloqueado
    if (block.blocked_times === null) return true;
    // Horário específico bloqueado
    if (Array.isArray(block.blocked_times)) {
      return block.blocked_times.some(
        (t) => t.slice(0, 5) === time.slice(0, 5)
      );
    }
    return false;
  }

  /** Gerar registros */
  function gerarRegistrosCompletos(pg: PaginaConfig): EventoCompleto[] {
    const eventosNaPagina = eventos.filter((ev) => pg.match(ev));

    const mapa = new Map<string, EscalaEvento>();
    eventosNaPagina.forEach((ev) => {
      mapa.set(`${ev.date}|${ev.time}|${ev.tituloExtra || ""}`, ev);
    });

    if (pg.isCombined) {
      // Página de MISSAS SOLENES / EXTRAS
      if (pg.key === "missas-solenes") {
        const extras: EventoCompleto[] = eventosNaPagina
          .filter((ev) => ev.isExtra && ev.ministros.length)
          .filter((ev) => !isHorarioBloqueado(ev.date, ev.time))
          .sort((a, b) =>
            a.date === b.date
              ? a.time.localeCompare(b.time)
              : a.date.localeCompare(b.date)
          )
          .map((ev) => ({
            date: ev.date,
            time: ev.time,
            dow: new Date(ev.date + "T00:00:00").getDay(),
            labelDia: DIAS_LONGO[new Date(ev.date + "T00:00:00").getDay()],
            labelDiaHora: `${DIAS_LONGO[new Date(ev.date + "T00:00:00").getDay()]} - ${ev.time}`,
            isExtra: true,
            tituloExtra: ev.tituloExtra,
            ministros: ev.ministros,
          }));

        return extras;
      }

      // Página de DOMINGOS
      const blocksPorHora: Record<string, EventoCompleto[]> = {};
      domingoTimes.forEach((t) => (blocksPorHora[t] = []));

      dias.forEach((date) => {
        const dow = new Date(date + "T00:00:00").getDay();
        if (dow !== 0) return;
        domingoTimes.forEach((t) => {
          const key = `${date}|${t}|`;
          const ev = mapa.get(key);
          if (!ev || !ev.ministros.length) return;

          // Se horário está bloqueado, não inclui ministros (evita vazamento de nomes por recorrência)
          const bloqueado = isHorarioBloqueado(date, t);
          if (bloqueado) return; // não inclui linha de domingo bloqueado

          blocksPorHora[t].push({
            date,
            time: t,
            dow,
            labelDia: DIAS_LONGO[dow],
            labelDiaHora: DIAS_LONGO[dow],
            isExtra: false,
            tituloExtra: null,
            ministros: ev.ministros,
          });
        });
      });

      const final: EventoCompleto[] = [];

      domingoTimes.forEach((t) => {
        const blk = blocksPorHora[t];
        if (blk.length) {
          blk[0].groupLabel = `DOMINGOS — ${t}`;
          final.push(...blk);
        }
      });

      return final;
    }

    const out: EventoCompleto[] = [];

    const t = pg.times[0];
    if (!t) return [];

    dias.forEach((date) => {
      const key = `${date}|${t}|`;
      const ev = mapa.get(key);
      const dow = new Date(date + "T00:00:00").getDay();
      const bloqueado = isHorarioBloqueado(date, t);

      // Se está bloqueado, gera linha com "Não haverá missa" (sem ministros)
      // mesmo que não haja registro de escala — assim o admin vê o status do mês completo
      if (bloqueado) {
        // Só adiciona linha de bloqueado se houver horário cadastrado para aquele dia da semana
        // (já garantido pelo filtro pg.match — verificamos se existe horário regular)
        // Para evitar inundar com bloqueios sem missa programada, só mostramos se tinha algo programado
        if (ev && ev.ministros.length) {
          out.push({
            date,
            time: t,
            dow,
            labelDia: DIAS_LONGO[dow],
            labelDiaHora: DIAS_LONGO[dow],
            isExtra: false,
            tituloExtra: null,
            ministros: [], // vazio: não vaza nomes da recorrência
          });
        }
        return;
      }

      if (!ev || !ev.ministros.length) return;

      out.push({
        date,
        time: t,
        dow,
        labelDia: DIAS_LONGO[dow],
        labelDiaHora: DIAS_LONGO[dow],
        isExtra: false,
        tituloExtra: null,
        ministros: ev.ministros,
      });
    });

    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  const nenhumaPaginaVisivel =
    !carregando &&
    paginas.every(
      (pg) => !pg.include || gerarRegistrosCompletos(pg).length === 0
    );

  /** Render */
  if (loadingAdmin) {
    return (
      <div className="flex justify-center items-center h-40">
        <span className="text-gray-600">Carregando permissões...</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-red-50 border border-red-200 rounded-lg max-w-md mx-auto mt-10">
        <h2 className="text-xl font-bold text-red-700">Acesso Restrito</h2>
        <p className="mt-2 text-sm text-red-600">
          Esta página é exclusiva para administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <style>{printCss}</style>

      {/* Controles */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4 p-4 bg-[#F0F4FA] rounded-2xl border border-gray-200">
        <div className="flex gap-2">
          <select
            value={mes0}
            onChange={(e) => setMes0(parseInt(e.target.value, 10))}
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold bg-white focus:border-[#4A6FA5] focus:outline-none"
          >
            {MESES.map((m, i) => (
              <option key={i} value={i}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={ano}
            onChange={(e) => setAno(parseInt(e.target.value, 10))}
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold bg-white focus:border-[#4A6FA5] focus:outline-none"
          >
            {Array.from({ length: 7 }, (_, k) => ano - 3 + k).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handlePrint}
          disabled={carregando}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1E3A6E] to-[#4A6FA5] text-white text-sm font-bold shadow-md no-print disabled:opacity-50"
        >
          Imprimir / Salvar PDF (A4)
        </button>
      </div>

      {/* Filtros */}
      <div className="no-print bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
        {/* Cabeçalho do card no padrão do app */}
        <div className="px-4 py-3 bg-gradient-to-r from-[#EEF4FF] to-[#F8FAFF] border-b border-[#D6E6F7] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <h3 className="text-sm font-bold text-[#1E3A6E]">
              Páginas para impressão
            </h3>
          </div>
          <span className="text-[11px] text-[#4A6FA5] font-semibold">
            {[
              ...Object.values(includedTimes).filter(Boolean),
              includeDomingos,
              includeMissasSolenes,
            ].filter(Boolean).length}{" "}
            de {times.length + 2} ativas
          </span>
        </div>

        {/* Lista de toggles */}
        <div className="divide-y divide-gray-100">
          {/* Missas regulares por horário */}
          {times.map((t) => {
            const checked = includedTimes[t] ?? false;
            return (
              <button
                key={t}
                type="button"
                onClick={() =>
                  setIncludedTimes((prev) => ({ ...prev, [t]: !prev[t] }))
                }
                className={`w-full px-4 py-3 flex items-center justify-between gap-3 transition-colors text-left ${
                  checked ? "bg-white hover:bg-[#F8FAFF]" : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      checked
                        ? "bg-[#EEF4FF] text-[#1E3A6E]"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    🕐
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold truncate ${
                        checked ? "text-gray-800" : "text-gray-500"
                      }`}
                    >
                      Missas — {t}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Segunda a sábado neste horário
                    </p>
                  </div>
                </div>
                <span
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    checked ? "bg-[#4A6FA5]" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      checked ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>
            );
          })}

          {/* Domingos */}
          <button
            type="button"
            onClick={() => setIncludeDomingos(!includeDomingos)}
            className={`w-full px-4 py-3 flex items-center justify-between gap-3 transition-colors text-left ${
              includeDomingos ? "bg-white hover:bg-[#F8FAFF]" : "bg-gray-50 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  includeDomingos
                    ? "bg-[#EEF4FF] text-[#1E3A6E]"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                ⛪
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold truncate ${
                    includeDomingos ? "text-gray-800" : "text-gray-500"
                  }`}
                >
                  Domingos
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                  Horários: {domingoTimes.join(" • ")}
                </p>
              </div>
            </div>
            <span
              className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                includeDomingos ? "bg-[#4A6FA5]" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  includeDomingos ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </span>
          </button>

          {/* Missas Solenes / Extras */}
          <button
            type="button"
            onClick={() => setIncludeMissasSolenes(!includeMissasSolenes)}
            className={`w-full px-4 py-3 flex items-center justify-between gap-3 transition-colors text-left ${
              includeMissasSolenes ? "bg-white hover:bg-[#F8FAFF]" : "bg-gray-50 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  includeMissasSolenes
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                ✨
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold truncate ${
                    includeMissasSolenes ? "text-gray-800" : "text-gray-500"
                  }`}
                >
                  Missas Solenes / Extras
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Celebrações especiais e datas avulsas
                </p>
              </div>
            </div>
            <span
              className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                includeMissasSolenes ? "bg-purple-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  includeMissasSolenes ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </span>
          </button>
        </div>

        {/* Ações + status */}
        <div className="px-4 py-3 bg-[#FAFBFD] border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              onClick={selecionarTodos}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#D6E6F7] text-[11px] font-semibold text-[#1E3A6E] hover:bg-[#EEF4FF] transition-colors"
            >
              ✓ Selecionar todos
            </button>
            <button
              onClick={limparTodos}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ✕ Limpar
            </button>
          </div>

          {carregando && (
            <span className="text-[11px] text-[#4A6FA5] font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4A6FA5] animate-pulse" />
              Carregando {labelMesAno}...
            </span>
          )}
        </div>

        {erro && (
          <div className="mx-4 mb-3 mt-1 text-[11px] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            ⚠️ {erro}
          </div>
        )}
      </div>

      {/* IMPRESSÃO */}
      <div className="only-print">
        {paginas.map((pg) => {
          if (!pg.include) return null;

          const registros = gerarRegistrosCompletos(pg);
          if (!registros.length) return null;

          return (
            <div key={pg.key} className="page bg-white">
              <div className="px-4 pt-2 text-right text-[9px] text-gray-500">
                Escala de Ministros
              </div>

              <div className="px-4 text-center font-semibold text-[10px] text-gray-700">
                ESCALA DE MINISTROS EXTRAORDINÁRIOS DA DISTRIBUIÇÃO DA EUCARISTIA
              </div>

              <div className="px-4 pb-3 pt-1 text-center font-black text-[26px] tracking-wide leading-tight">
                {labelMesAno} — {pg.label}
              </div>

              <table className="w-full table-black zebra text-[9px] border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-1.5 border text-left w-[60px]">DATA</th>
                    <th className="p-1.5 border text-left w-[80px]">DIA / SEMANA</th>
                    <th className="p-1.5 border text-left">MINISTROS</th>
                  </tr>
                </thead>

                <tbody>
                  {registros.map((ev, i) => {
                    const nomesOrdenados = [...ev.ministros].sort((a, b) =>
                      a.localeCompare(b, "pt-BR")
                    );

                    const labelDiaSemana = ev.isExtra
                      ? ev.labelDiaHora
                      : ev.labelDia;

                    const block = blockedMapState.get(ev.date);

                    const isDayBlocked =
                      block && block.blocked_times === null;

                    const isTimeBlocked =
                      block &&
                      Array.isArray(block.blocked_times) &&
                      block.blocked_times.some(
                        (t) => t.slice(0, 5) === ev.time.slice(0, 5)
                      );

                    return (
                      <React.Fragment
                        key={`${ev.date}-${ev.time}-${ev.tituloExtra || ""}-${i}`}
                      >
                        {ev.groupLabel && (
                          <tr className={`print-separator ${ev.groupLabel.includes("SOLENES") ? "bg-purple-100" : "bg-gray-200"}`}>
                            <td
                              colSpan={3}
                              className={`p-1.5 border text-left font-bold ${ev.groupLabel.includes("SOLENES") ? "text-[12px] text-purple-700" : "text-[9px] text-gray-800"}`}
                            >
                              {ev.groupLabel}
                            </td>
                          </tr>
                        )}

                        <tr className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                          <td className="p-1.5 border whitespace-nowrap font-bold">
                            {formatDateBR(ev.date)}
                          </td>

                          <td className="p-1.5 border whitespace-nowrap font-bold">
                            {labelDiaSemana}

                            {ev.isExtra && ev.tituloExtra && (
                              <div className="text-[10px] text-purple-700 font-bold">
                                {ev.tituloExtra}
                              </div>
                            )}
                          </td>

                          {/* COLUNA MINISTROS OU AVISO DE BLOQUEIO */}
                          <td className="p-1.5 border">
                            {isDayBlocked || isTimeBlocked ? (
                              <div className="text-gray-500 italic text-[9px] leading-tight">
                                Não haverá missa{block?.reason ? ` — ${block.reason}` : ""}
                              </div>
                            ) : (
                              <NamesRow nomes={nomesOrdenados} singleLine={pg.singleLine} />
                            )}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        {nenhumaPaginaVisivel && (
          <div className="page">
            <div className="px-4 py-3 text-center text-xs">
              Nenhuma página disponível para impressão com os filtros selecionados.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
