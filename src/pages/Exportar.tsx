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
  const MAX = 11;
  const ref = useRef<HTMLDivElement>(null);
  const compact = useMemo(() => compactNames(nomes), [nomes]);

  useEffect(() => {
    if (!singleLine || !ref.current) return;
    const el = ref.current;
    const parent = el.parentElement;
    if (!parent) return;
    let size = 11;
    el.style.fontSize = `${size}px`;
    el.style.whiteSpace = "nowrap";
    while (el.scrollWidth > parent.clientWidth && size > 8) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [compact, singleLine]);

  if (!compact.length) return <span className="text-gray-500">—</span>;

  if (!singleLine && compact.length > MAX) {
    const linhas: string[][] = [];
    for (let i = 0; i < compact.length; i += MAX)
      linhas.push(compact.slice(i, i + MAX));

    return (
      <div className="flex flex-col gap-0.5">
        {linhas.map((linha, i) => (
          <div key={i} className="text-[10px] font-semibold">
            {linha.join(" - ")}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="text-[10px] font-semibold whitespace-nowrap overflow-hidden"
    >
      {compact.slice(0, MAX).join(" - ")}
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
  const [includeDomingosExtras, setIncludeDomingosExtras] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);

  const dias = useMemo(() => diasDoMes(ano, mes0), [ano, mes0]);
  const labelMesAno = `${MESES[mes0]} ${ano}`;

  const printCss = `
  @media print {
    @page { size: A4; margin: 12mm; }
    header, nav, .no-print { display: none !important; }
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
        .select("id, time");

      if (hErr && hErr.code !== "42P01") throw hErr;

      const horarioMap = new Map<number, string>();
      (hData || []).forEach((h: any) => {
        if (!h.id || !h.time) return;
        horarioMap.set(h.id, String(h.time).slice(0, 5));
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
    setIncludeDomingosExtras(true);
  }

  function limparTodos() {
    const next: Record<string, boolean> = {};
    times.forEach((t) => (next[t] = false));
    setIncludedTimes(next);
    setIncludeDomingosExtras(false);
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
      key: "domingos-extras",
      label: `Página ÚNICA: Domingos ${domingoTimes.join(", ")} e Missas Extras`,
      include: includeDomingosExtras,
      singleLine: true,
      times: domingoTimes,
      isCombined: true,
      match: (ev: EscalaEvento) => {
        if (ev.isExtra) return true;
        const dow = new Date(ev.date + "T00:00:00").getDay();
        return dow === 0 && domingoTimes.includes(ev.time);
      },
    },
  ];

  /** Gerar registros */
  function gerarRegistrosCompletos(pg: PaginaConfig): EventoCompleto[] {
    const eventosNaPagina = eventos.filter((ev) => pg.match(ev));

    const mapa = new Map<string, EscalaEvento>();
    eventosNaPagina.forEach((ev) => {
      mapa.set(`${ev.date}|${ev.time}|${ev.tituloExtra || ""}`, ev);
    });

    if (pg.isCombined) {
      const blocksPorHora: Record<string, EventoCompleto[]> = {};
      domingoTimes.forEach((t) => (blocksPorHora[t] = []));

      dias.forEach((date) => {
        const dow = new Date(date + "T00:00:00").getDay();
        if (dow !== 0) return;
        domingoTimes.forEach((t) => {
          const key = `${date}|${t}|`;
          const ev = mapa.get(key);
          if (!ev || !ev.ministros.length) return;

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

      const extras: EventoCompleto[] = eventosNaPagina
        .filter((ev) => ev.isExtra && ev.ministros.length)
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

      const final: EventoCompleto[] = [];

      domingoTimes.forEach((t) => {
        const blk = blocksPorHora[t];
        if (blk.length) {
          blk[0].groupLabel = `DOMINGOS — ${t}`;
          final.push(...blk);
        }
      });

      if (extras.length) {
        extras[0].groupLabel = "MISSAS EXTRAS";
        final.push(...extras);
      }

      return final;
    }

    const out: EventoCompleto[] = [];

    const t = pg.times[0];
    if (!t) return [];

    dias.forEach((date) => {
      const key = `${date}|${t}|`;
      const ev = mapa.get(key);
      if (!ev || !ev.ministros.length) return;

      const dow = new Date(date + "T00:00:00").getDay();
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
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          <select
            value={mes0}
            onChange={(e) => setMes0(parseInt(e.target.value, 10))}
            className="px-3 py-2 rounded-2xl border text-xs font-semibold bg-white"
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
            className="px-3 py-2 rounded-2xl border text-xs font-semibold bg-white"
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
          className="px-4 py-2 rounded-2xl bg-[#1f3c88] text-white text-sm font-bold shadow no-print disabled:opacity-50"
        >
          Imprimir / Salvar PDF (A4)
        </button>
      </div>

      {/* Filtros */}
      <div className="no-print bg-white border rounded-2xl p-4 mb-4 space-y-3">
        <div className="text-sm font-semibold">
          Selecionar quais páginas de escala serão incluídas na impressão
        </div>

        <div className="space-y-1">
          {times.map((t) => (
            <label key={t} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={includedTimes[t] ?? false}
                onChange={(e) =>
                  setIncludedTimes((prev) => ({
                    ...prev,
                    [t]: e.target.checked,
                  }))
                }
              />
              <span>Página: Missas — {t}</span>
            </label>
          ))}

          <label className="flex items-center gap-2 text-xs mt-2">
            <input
              type="checkbox"
              checked={includeDomingosExtras}
              onChange={(e) => setIncludeDomingosExtras(e.target.checked)}
            />
            <span>Página ÚNICA: Domingos {domingoTimes.join(", ")} e Missas Extras</span>
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={selecionarTodos}
            className="px-3 py-1.5 rounded-2xl border text-[11px]"
          >
            Selecionar todos
          </button>
          <button
            onClick={limparTodos}
            className="px-3 py-1.5 rounded-2xl border text-[11px]"
          >
            Limpar
          </button>
        </div>

        {erro && (
          <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {erro}
          </div>
        )}

        {carregando && (
          <div className="text-[11px] text-gray-600">
            Carregando escala para {labelMesAno}...
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

              <div className="px-4 text-center font-black text-[12px]">
                ESCALA DE MINISTROS EXTRAORDINÁRIOS DA DISTRIBUIÇÃO DA EUCARISTIA
              </div>

              <div className="px-4 pb-2 text-center font-semibold text-[10px]">
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
                          <tr className="bg-gray-200 print-separator">
                            <td
                              colSpan={3}
                              className="p-1.5 border text-left font-bold text-[9px] text-gray-800"
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
                              <div className="text-[8px] text-gray-600 font-normal">
                                {ev.tituloExtra}
                              </div>
                            )}
                          </td>

                          {/* COLUNA MINISTROS OU AVISO DE BLOQUEIO */}
                          <td className="p-1.5 border">
                            {isDayBlocked || isTimeBlocked ? (
                              <div className="text-red-700 font-bold text-[10px] leading-tight">
                                NÃO HAVERÁ MISSA
                                <div className="text-[9px] text-red-600 font-normal">
                                  Motivo: {block?.reason || "Não especificado"}
                                </div>
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
