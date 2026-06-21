import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Vehicle, SeatWithAssignment, Event, EventDay, Congregation } from '../types'
import { formatDocumentType } from './utils'

// ─────────────────────────────────────────────
// Legacy per-vehicle exports (ainda usados em VehicleDetailPage)
// ─────────────────────────────────────────────

interface AssignmentWithPassenger {
  seat?: { seat_number: number }
  passenger?: {
    full_name: string
    document_type: string
    document_number: string
    is_minor: boolean
    guardian?: {
      full_name: string
      document_type: string
      document_number: string
    }
  }
  payment_status: string
}

export async function exportToExcel(vehicle: Vehicle, assignments: AssignmentWithPassenger[]) {
  const rows = assignments
    .sort((a, b) => (a.seat?.seat_number ?? 0) - (b.seat?.seat_number ?? 0))
    .map(a => ({
      'Assento': a.seat?.seat_number ?? '',
      'Nome do Passageiro': a.passenger?.full_name ?? '',
      'Tipo de Documento': formatDocumentType(a.passenger?.document_type as any ?? 'cpf'),
      'Número do Documento': a.passenger?.document_number ?? '',
      'Menor de Idade': a.passenger?.is_minor ? 'Sim' : 'Não',
      'Responsável': a.passenger?.guardian?.full_name ?? '',
      'Status Pagamento': a.payment_status === 'paid' ? 'Pago' : 'Pendente',
    }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  ws['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Passageiros')
  XLSX.writeFile(wb, `DeskBus_${vehicle.name}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
}

export async function exportToPDF(vehicle: Vehicle, seats: SeatWithAssignment[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFillColor(251, 191, 36)
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(120, 53, 15)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('DeskBus', 14, 12)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Lista de Passageiros', 14, 20)
  doc.setFontSize(10)
  doc.text(vehicle.name, 14, 26)
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(9)
  doc.text(`Exportado em: ${new Date().toLocaleString('pt-BR')}`, 140, 10)
  doc.text(`Total: ${seats.filter(s => s.assignment).length} passageiros`, 140, 16)

  const activeSeats = seats.filter(s => s.assignment).sort((a, b) => a.seat_number - b.seat_number)
  autoTable(doc, {
    startY: 36,
    head: [['#', 'Assento', 'Passageiro', 'Documento', 'Menor', 'Responsável', '✓']],
    body: activeSeats.map((s, i) => [
      i + 1, s.seat_number,
      s.assignment?.passenger?.full_name ?? '',
      `${formatDocumentType(s.assignment?.passenger?.document_type as any ?? 'cpf')}: ${s.assignment?.passenger?.document_number ?? ''}`,
      s.assignment?.passenger?.is_minor ? 'Sim' : 'Não',
      s.assignment?.passenger?.guardian?.full_name ?? '-',
      '☐',
    ]),
    headStyles: { fillColor: [251, 191, 36], textColor: [120, 53, 15], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [255, 251, 235] },
  })
  doc.save(`DeskBus_${vehicle.name}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`)
}

// ─────────────────────────────────────────────
// Exportação consolidada por Congregação
// ─────────────────────────────────────────────

export interface ExportPassengerRow {
  name: string
  documentType: string
  documentNumber: string
  isMinor: boolean
  guardianName: string
  vehicleName: string
  seatNumber: number | null
  paymentStatus: string
  eventDayId: string | null
}

function dateStr() {
  return new Date().toLocaleDateString('pt-BR')
}

function paymentLabel(s: string) {
  return s === 'paid' ? 'Pago' : 'Pendente'
}

export async function exportCongregationToExcel(
  congregation: Congregation,
  event: Event | null,
  eventDays: EventDay[],
  rows: ExportPassengerRow[],
) {
  const wb = XLSX.utils.book_new()
  const filename = `DeskBus_${congregation.name}_${dateStr().replace(/\//g, '-')}.xlsx`

  function buildSheet(passengers: ExportPassengerRow[], dayLabel: string) {
    const data = passengers.map(p => ({
      'Nome': p.name,
      'Documento': `${formatDocumentType(p.documentType as any)}: ${p.documentNumber}`,
      'Menor de Idade': p.isMinor ? 'Sim' : 'Não',
      'Responsável': p.guardianName || '—',
      'Veículo': p.vehicleName || '—',
      'Assento': p.seatNumber ?? '—',
      'Pagamento': paymentLabel(p.paymentStatus),
    }))

    const ws = XLSX.utils.aoa_to_sheet([])

    // Cabeçalho informativo
    const header = [
      [`Congregação: ${congregation.name}`],
      [`Evento: ${event?.name ?? '—'}`],
      event ? [`Período: ${new Date(event.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(event.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}`] : [],
      [`Exportado em: ${new Date().toLocaleString('pt-BR')}`],
      [`Dia: ${dayLabel} — ${passengers.length} passageiro${passengers.length !== 1 ? 's' : ''}`],
      [],
    ]
    XLSX.utils.sheet_add_aoa(ws, header, { origin: 'A1' })
    XLSX.utils.sheet_add_json(ws, data, { origin: `A${header.length + 1}`, skipHeader: false })

    ws['!cols'] = [
      { wch: 35 }, { wch: 25 }, { wch: 14 }, { wch: 30 }, { wch: 20 }, { wch: 8 }, { wch: 12 }
    ]
    return ws
  }

  if (eventDays.length === 0) {
    // Sem dias definidos — uma única aba
    XLSX.utils.book_append_sheet(wb, buildSheet(rows, 'Todos os dias'), 'Passageiros')
  } else {
    for (const day of eventDays) {
      const dayRows = rows.filter(r => r.eventDayId === day.id)
      const sheetName = day.label.substring(0, 31) // Excel limit
      XLSX.utils.book_append_sheet(wb, buildSheet(dayRows, day.label), sheetName)
    }
    // Aba de total geral
    XLSX.utils.book_append_sheet(wb, buildSheet(rows, 'Todos os dias'), 'Geral')
  }

  XLSX.writeFile(wb, filename)
}

export async function exportCongregationToPDF(
  congregation: Congregation,
  event: Event | null,
  eventDays: EventDay[],
  rows: ExportPassengerRow[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  function addPageHeader(doc: jsPDF, page: number) {
    doc.setFillColor(251, 191, 36)
    doc.rect(0, 0, 210, 28, 'F')
    doc.setTextColor(120, 53, 15)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('DeskBus', 14, 10)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(congregation.name, 14, 17)
    doc.setFontSize(9)
    doc.text(event?.name ?? '', 14, 23)

    doc.setTextColor(100, 53, 15)
    doc.setFontSize(8)
    doc.text(`Exportado: ${new Date().toLocaleString('pt-BR')}`, 130, 10)
    doc.text(`Total: ${rows.length} passageiros`, 130, 16)
    if (event) {
      doc.text(
        `${new Date(event.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} – ${new Date(event.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}`,
        130, 22
      )
    }

    // Footer com número de página
    doc.setTextColor(180, 180, 180)
    doc.setFontSize(7)
    doc.text(`Página ${page}`, 200, 295, { align: 'right' })
    doc.setTextColor(0, 0, 0)
  }

  function addDaySection(doc: jsPDF, dayLabel: string, dayRows: ExportPassengerRow[], startY: number, isFirst: boolean): number {
    // Day title
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(50, 50, 50)
    doc.text(`${dayLabel}  (${dayRows.length} passageiro${dayRows.length !== 1 ? 's' : ''})`, 14, startY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)

    if (dayRows.length === 0) {
      doc.setFontSize(9)
      doc.setTextColor(150, 150, 150)
      doc.text('Nenhum passageiro registrado para este dia.', 14, startY + 6)
      doc.setTextColor(0, 0, 0)
      return startY + 14
    }

    let finalY = startY
    autoTable(doc, {
      startY: startY + 4,
      head: [['#', 'Nome', 'Documento', 'Menor', 'Responsável', 'Veículo', 'Assento', 'Pagto']],
      body: dayRows.map((r, i) => [
        i + 1,
        r.name,
        `${formatDocumentType(r.documentType as any)}: ${r.documentNumber}`,
        r.isMinor ? 'Sim' : 'Não',
        r.guardianName || '—',
        r.vehicleName || '—',
        r.seatNumber ?? '—',
        paymentLabel(r.paymentStatus),
      ]),
      headStyles: {
        fillColor: [251, 191, 36], textColor: [120, 53, 15],
        fontStyle: 'bold', fontSize: 7,
      },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [255, 251, 235] },
      columnStyles: {
        0: { cellWidth: 6 },   // #
        1: { cellWidth: 44 },  // Nome
        2: { cellWidth: 34 },  // Documento
        3: { cellWidth: 13 },  // Menor
        4: { cellWidth: 30 },  // Responsável
        5: { cellWidth: 24 },  // Veículo
        6: { cellWidth: 14 },  // Assento
        7: { cellWidth: 17 },  // Pagto
      },
      didDrawPage: (data) => {
        finalY = data.cursor?.y ?? finalY
      },
      margin: { left: 14, right: 14 },
    })

    return (doc as any).lastAutoTable?.finalY ?? finalY
  }

  // Render
  let page = 1
  addPageHeader(doc, page)

  if (eventDays.length === 0) {
    addDaySection(doc, 'Todos os dias', rows, 36, true)
  } else {
    let y = 36
    for (let i = 0; i < eventDays.length; i++) {
      const day = eventDays[i]
      const dayRows = rows.filter(r => r.eventDayId === day.id)

      if (i > 0 && y > 220) {
        doc.addPage()
        page++
        addPageHeader(doc, page)
        y = 36
      } else if (i > 0) {
        y += 8
      }

      y = addDaySection(doc, day.label, dayRows, y, i === 0)
      y += 4
    }
  }

  const safeFilename = congregation.name.replace(/[^a-zA-Z0-9À-ɏ\s_-]/g, '')
  doc.save(`DeskBus_${safeFilename}_${dateStr().replace(/\//g, '-')}.pdf`)
}
