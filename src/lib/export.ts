import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Vehicle, SeatWithAssignment } from '../types'
import { formatDocumentType } from './utils'

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
      'Nome do Responsável': a.passenger?.guardian?.full_name ?? '',
      'Doc. Responsável (Tipo)': a.passenger?.guardian ? formatDocumentType(a.passenger.guardian.document_type as any) : '',
      'Doc. Responsável (Número)': a.passenger?.guardian?.document_number ?? '',
      'Status Pagamento': a.payment_status === 'paid' ? 'Pago' : 'Pendente',
    }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()

  // Style header row width
  ws['!cols'] = [
    { wch: 8 }, { wch: 30 }, { wch: 25 }, { wch: 20 },
    { wch: 14 }, { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 16 }
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Passageiros')
  XLSX.writeFile(wb, `DeskBus_${vehicle.name}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
}

export async function exportToPDF(vehicle: Vehicle, seats: SeatWithAssignment[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Header
  doc.setFillColor(251, 191, 36) // amber-400
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(120, 53, 15) // amber-900
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
  doc.text(`Total de passageiros: ${seats.filter(s => s.assignment).length}`, 140, 16)
  doc.text(`Capacidade: ${vehicle.capacity} lugares`, 140, 22)

  const activeSeats = seats.filter(s => s.assignment).sort((a, b) => a.seat_number - b.seat_number)

  autoTable(doc, {
    startY: 36,
    head: [['#', 'Assento', 'Passageiro', 'Documento', 'Menor', 'Responsável', 'Embarcou']],
    body: activeSeats.map((s, i) => [
      i + 1,
      s.seat_number,
      s.assignment?.passenger?.full_name ?? '',
      `${formatDocumentType(s.assignment?.passenger?.document_type as any ?? 'cpf')}: ${s.assignment?.passenger?.document_number ?? ''}`,
      s.assignment?.passenger?.is_minor ? 'Sim' : 'Não',
      s.assignment?.passenger?.guardian?.full_name ?? '-',
      '☐', // checkbox for manual check
    ]),
    headStyles: { fillColor: [251, 191, 36], textColor: [120, 53, 15], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [255, 251, 235] },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 14 },
      2: { cellWidth: 50 },
      3: { cellWidth: 40 },
      4: { cellWidth: 14 },
      5: { cellWidth: 40 },
      6: { cellWidth: 14 },
    },
  })

  doc.save(`DeskBus_${vehicle.name}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`)
}
