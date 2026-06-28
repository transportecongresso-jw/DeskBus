import { DocumentType, VehicleType } from '../types'

export function formatDocumentType(type: DocumentType): string {
  const map: Record<DocumentType, string> = {
    cpf: 'CPF',
    rg: 'RG',
    birth_certificate: 'Certidão de Nascimento',
  }
  return map[type]
}

export function formatVehicleType(type: VehicleType): string {
  const map: Record<VehicleType, string> = { bus: 'Ônibus', van: 'Van', microbus: 'Micro-ônibus' }
  return map[type] ?? type
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatRG(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1})$/, '$1-$2')
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function generateSeats(vehicleId: string, capacity: number) {
  const seats = []
  // Layout: driver seat + passenger seats
  // Bus layout: 2+2 columns (4 per row typically)
  // Van layout: 2+1 columns (3 per row)
  // We'll use a simple numbered approach
  for (let i = 1; i <= capacity; i++) {
    seats.push({
      vehicle_id: vehicleId,
      seat_number: i,
      row_number: Math.ceil(i / 4),
      column_position: ((i - 1) % 4) + 1,
      is_driver: false,
    })
  }
  return seats
}

export const BOARDING_OBSERVATION_OPTIONS = [
  'Está atrasado(a)',
  'Foi em outro veículo',
  'Desistiu',
  'Está doente',
  'Outro motivo',
]
