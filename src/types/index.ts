export type UserRole = 'admin_general' | 'admin_congregation'

export type EventStatus = 'active' | 'closed' | 'cancelled'

export interface Event {
  id: string
  name: string
  start_date: string
  end_date: string
  status: EventStatus
  notes: string | null
  created_at: string
  created_by: string | null
}

export interface EventCongregation {
  id: string
  event_id: string
  congregation_id: string
  created_at: string
}

export interface EventDay {
  id: string
  event_id: string
  date: string
  label: string
  day_order: number
  created_at: string
}

export interface PassengerEventDay {
  id: string
  passenger_id: string
  event_day_id: string
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  created_at: string
}

export type ListStatus = 'in_progress' | 'finalized'

export interface Congregation {
  id: string
  name: string
  city: string | null
  created_at: string
  created_by: string
  list_status: ListStatus
  finalized_at: string | null
  finalized_by: string | null
}

export interface CongregationAdmin {
  id: string
  congregation_id: string
  user_id: string
  created_at: string
  profile?: Profile
  congregation?: Congregation
}

export type VehicleType = 'bus' | 'van'

export interface Vehicle {
  id: string
  congregation_id: string
  event_id: string | null
  event_day_id: string | null
  type: VehicleType
  capacity: number
  name: string
  ticket_price: number
  export_count: number
  exported_at: string | null
  post_close_changes: number | null
  created_at: string
  congregation?: Congregation
  event_day?: EventDay
}

export interface Seat {
  id: string
  vehicle_id: string
  seat_number: number
  row_number: number
  column_position: number
  is_driver: boolean
  created_at: string
}

export type DocumentType = 'cpf' | 'rg' | 'birth_certificate'

export interface Passenger {
  id: string
  congregation_id: string
  event_id: string | null
  full_name: string
  document_type: DocumentType
  document_number: string
  is_minor: boolean
  guardian_id: string | null
  created_at: string
  guardian?: Passenger
}

export type PaymentStatus = 'paid' | 'pending'
export type BoardingStatus = 'boarded' | 'not_boarded' | 'pending'
export type AssignmentStatus = 'active' | 'cancelled'

export interface SeatAssignment {
  id: string
  seat_id: string
  passenger_id: string
  vehicle_id: string
  status: AssignmentStatus
  payment_status: PaymentStatus
  boarding_status: BoardingStatus
  boarding_observation: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  substituted_from: string | null
  substitution_reason: string | null
  created_at: string
  updated_at: string
  seat?: Seat
  passenger?: Passenger
  vehicle?: Vehicle
}

export interface AuditLog {
  id: string
  vehicle_id: string | null
  congregation_id: string
  action_type: string
  description: string
  performed_by: string
  created_at: string
  profile?: Profile
}

export interface ExportRecord {
  id: string
  vehicle_id: string
  congregation_id: string
  export_type: 'excel' | 'pdf'
  exported_by: string
  created_at: string
}

export interface SeatWithAssignment extends Seat {
  assignment?: SeatAssignment & { passenger: Passenger }
}

export interface VehicleStats {
  total_seats: number
  occupied: number
  available: number
  excess: number
  paid: number
  pending: number
  total_collected: number
  total_expected: number
  total_pending_amount: number
}
