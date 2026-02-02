import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import jsPDF from "jspdf";

type MinisterBirthday = {
  id: string;
  name: string;
  birth_date: string;
};

type BirthdayByMonth = {
  month: number;
  birthdays: { name: string; day: number }[];
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

export default function Aniversariantes() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const [loading, setLoading] = useState(false);
  const [birthdayData, setBirthdayData] = useState<BirthdayByMonth[]>([]);
  const [error, setError] = useState<string | null>(null);

  // verifica admin
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
    if (isAdmin) loadBirthdays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, year]);

  async function loadBirthdays() {
    setLoading(true);
    setError(null);

    try {
      // buscar todos os ministros com data de aniversário
      const { data, error: fetchError } = await supabase
        .from("ministers")
        .select("id, name, birth_date")
        .not("birth_date", "is", null)
        .eq("active", true)
        .order("name");

      if (fetchError) {
        setError("Erro ao carregar aniversariantes.");
        setLoading(false);
        return;
      }

      const ministers = (data || []) as MinisterBirthday[];

      // organizar por mês
      const byMonth: BirthdayByMonth[] = Array.from({ length: 12 }, (_, i) => ({
        month: i,
        birthdays: [],
      }));

      ministers.forEach((minister) => {
        if (minister.birth_date) {
          const date = new Date(minister.birth_date + "T00:00:00");
          const month = date.getMonth();
          const day = date.getDate();

          byMonth[month].birthdays.push({
            name: minister.name,
            day: day,
          });
        }
      });

      // ordenar por dia dentro de cada mês
      byMonth.forEach((monthData) => {
        monthData.birthdays.sort((a, b) => a.day - b.day);
      });

      setBirthdayData(byMonth);
    } catch (e) {
      console.error(e);
      setError("Erro inesperado ao carregar aniversariantes.");
    } finally {
      setLoading(false);
    }
  }

  function exportPDF() {
    const doc = new jsPDF('p', 'mm', 'a4'); // Formato A4 explícito (210 x 297 mm)

    let yPosition = 28; // Começar após o cabeçalho (agora maior)
    const pageHeight = 275; // Limite antes do rodapé
    const leftMargin = 15;
    const rightMargin = 195;
    const cardWidth = rightMargin - leftMargin;

    // Função para adicionar cabeçalho e rodapé
    const addHeaderFooter = (pageNum: number) => {
      // Cabeçalho
      doc.setFillColor(74, 111, 165);
      doc.rect(0, 0, 210, 18, 'F');
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Aniversariantes - Paróquia Nossa Senhora das Graças", 105, 8, { align: 'center' });
      
      // Ano logo abaixo do título
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(230, 240, 255);
      doc.text(`Ano: ${year}`, 105, 13, { align: 'center' });
      
      // Rodapé
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(`Página ${pageNum}`, 105, 290, { align: 'center' });
      doc.text(new Date().toLocaleDateString('pt-BR'), rightMargin, 290, { align: 'right' });
    };

    let pageNum = 1;
    addHeaderFooter(pageNum);

    birthdayData.forEach((monthData) => {
      if (monthData.birthdays.length === 0) return;

      // Verificar se precisa de nova página para o cabeçalho do mês
      if (yPosition > pageHeight - 25) {
        doc.addPage();
        pageNum++;
        addHeaderFooter(pageNum);
        yPosition = 28;
      }

      // Cabeçalho do mês com fundo azul
      doc.setFillColor(74, 111, 165); // #4A6FA5
      doc.roundedRect(leftMargin, yPosition - 6, cardWidth, 14, 2, 2, 'F');
      
      // Texto do mês em branco
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(MONTH_NAMES[monthData.month], leftMargin + 3, yPosition);
      
      // Contador de aniversariantes
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(230, 230, 230);
      doc.text(
        `${monthData.birthdays.length} aniversariante${monthData.birthdays.length !== 1 ? 's' : ''}`,
        leftMargin + 3,
        yPosition + 4
      );

      yPosition += 17;

      // Borda do card (para simular o card branco)
      doc.setDrawColor(229, 231, 235); // border-gray-200
      doc.setLineWidth(0.2);

      // Lista de aniversariantes
      monthData.birthdays.forEach((birthday, index) => {
        // Verificar se precisa de nova página
        if (yPosition > pageHeight - 12) {
          doc.addPage();
          pageNum++;
          addHeaderFooter(pageNum);
          yPosition = 28;
        }

        // Linha separadora (exceto no primeiro)
        if (index > 0) {
          doc.setDrawColor(243, 244, 246); // divide-gray-100
          doc.line(leftMargin, yPosition - 4, rightMargin, yPosition - 4);
        }

        // Fundo alternado
        if (index % 2 === 1) {
          doc.setFillColor(249, 250, 251); // hover:bg-gray-50
          doc.rect(leftMargin, yPosition - 4, cardWidth, 10, 'F');
        }

        // Círculo com o dia (menor)
        doc.setFillColor(230, 238, 249); // #E6EEF9
        doc.circle(leftMargin + 7, yPosition + 1, 4, 'F');
        
        // Dia do mês no círculo
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(74, 111, 165); // #4A6FA5
        const dayText = birthday.day.toString().padStart(2, "0");
        doc.text(dayText, leftMargin + 7, yPosition + 2, { align: 'center' });

        // Nome do aniversariante
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(31, 41, 55); // text-gray-800
        doc.text(birthday.name, leftMargin + 15, yPosition);

        // Data por extenso
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128); // text-gray-500
        doc.text(
          `${birthday.day} de ${MONTH_NAMES[monthData.month]}`,
          leftMargin + 15,
          yPosition + 3.5
        );


        yPosition += 10;
      });

      yPosition += 6; // Espaço entre cards de meses
    });

    doc.save(`aniversariantes-${year}.pdf`);
  }

  if (!isAdmin) {
    return (
      <p className="text-[10px] text-gray-600">
        Apenas administradores podem visualizar os aniversariantes.
      </p>
    );
  }

  const totalBirthdays = birthdayData.reduce(
    (acc, m) => acc + m.birthdays.length,
    0
  );

  return (
    <section className="space-y-3">
      {/* Seletores */}
      <div className="flex flex-wrap gap-2 items-center text-[9px]">
        <div className="font-semibold text-[#4A6FA5]">
          Aniversariantes — {year}
        </div>

        <select
          className="border rounded px-2 py-1 text-[9px] w-20"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {Array.from({ length: 10 }).map((_, i) => {
            const y = new Date().getFullYear() - 2 + i;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </select>
      </div>

      {/* Informativo */}
      <div className="bg-[#F7FAFF] border border-[#D6E6F7] rounded-xl px-3 py-2 text-[9px] text-[#3F5F8F]">
        <p>
          Lista completa de aniversariantes do ano organizados por mês. 
          Total de {totalBirthdays} aniversariante{totalBirthdays !== 1 ? "s" : ""} cadastrado{totalBirthdays !== 1 ? "s" : ""}.
        </p>
      </div>

      {/* Erro */}
      {error && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-[10px] text-gray-600">Carregando aniversariantes...</p>
      ) : totalBirthdays === 0 ? (
        <p className="text-[9px] text-gray-500">
          Nenhum aniversariante cadastrado para este ano.
        </p>
      ) : (
        <>
          {/* Botão PDF */}
          <div>
            <button
              onClick={exportPDF}
              className="px-3 py-1 text-[9px] bg-[#4A6FA5] text-white rounded hover:bg-[#3F5F8F]"
            >
              Exportar PDF
            </button>
          </div>

          {/* Cards por mês */}
          <div className="space-y-4">
            {birthdayData.map((monthData) => {
              if (monthData.birthdays.length === 0) return null;

              return (
                <div
                  key={monthData.month}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden"
                >
                  {/* Cabeçalho do mês */}
                  <div className="bg-gradient-to-r from-[#4A6FA5] to-[#5B7FB5] px-4 py-2">
                    <h3 className="text-sm font-semibold text-white">
                      {MONTH_NAMES[monthData.month]}
                    </h3>
                    <p className="text-[9px] text-white/80">
                      {monthData.birthdays.length} aniversariante
                      {monthData.birthdays.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Lista de aniversariantes */}
                  <div className="divide-y divide-gray-100">
                    {monthData.birthdays.map((birthday, index) => (
                      <div
                        key={index}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#E6EEF9] flex items-center justify-center">
                          <span className="text-sm font-bold text-[#4A6FA5]">
                            {birthday.day.toString().padStart(2, "0")}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-[11px] font-medium text-gray-800">
                            {birthday.name}
                          </p>
                          <p className="text-[9px] text-gray-500">
                            {birthday.day} de {MONTH_NAMES[monthData.month]}
                          </p>
                        </div>
                        <div className="text-[20px]">🎂</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
