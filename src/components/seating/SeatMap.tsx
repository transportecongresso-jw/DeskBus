import { cn } from '../../lib/utils'
import { User, Anchor } from 'lucide-react'
import { SeatWithAssignment } from '../../types'

interface SeatMapProps {
  seats: SeatWithAssignment[]
  vehicleType: 'bus' | 'van' | 'microbus'
  onSeatClick: (seat: SeatWithAssignment) => void
  selectedSeat?: string | null
  highlightPassenger?: string | null
  captainPassengerIds?: Set<string>
}

export function SeatMap({ seats, vehicleType, onSeatClick, selectedSeat, highlightPassenger, captainPassengerIds }: SeatMapProps) {
  // Van: 2+1 (3 per row). Bus/microbus: 2+2 (4 per row).
  // Group purely by seat_number — DB row_number/column_position may be stale.
  const seatsPerRow = vehicleType === 'van' ? 3 : 4
  const leftCount = 2
  const rightCount = vehicleType === 'van' ? 1 : 2

  const sortedSeats = [...seats].sort((a, b) => a.seat_number - b.seat_number)
  const rowGroups: SeatWithAssignment[][] = []
  for (let i = 0; i < sortedSeats.length; i += seatsPerRow) {
    rowGroups.push(sortedSeats.slice(i, i + seatsPerRow))
  }

  // Seat cell width: 44px (w-11). Gap between seats: 6px (gap-1.5).
  // Total width (bus): 20(row#) + 8(gap) + 94(2 seats) + 8(gap) + 16(aisle) + 8(gap) + 94(2 seats) = 248px → fits 375px
  // Total width (van): 20 + 8 + 94 + 8 + 16 + 8 + 44 = 198px → fits 375px
  const SEAT = 'w-11 h-11' // 44px — meets minimum touch-target size

  return (
    <div className="w-full">
      {/* Vehicle front label */}
      <div className="flex justify-center mb-3">
        <span className="px-5 py-1.5 bg-stone-200 dark:bg-stone-700 rounded-full text-[11px] font-medium text-stone-500 dark:text-stone-400 select-none">
          🚌 Frente do Veículo
        </span>
      </div>

      {/* Driver seat — right side (Brazilian standard) */}
      <div className="flex justify-end mb-1.5 pr-1">
        <div className={cn(SEAT, 'bg-stone-200 dark:bg-stone-700 rounded-lg flex items-center justify-center')} title="Motorista">
          <span className="text-[10px] font-bold text-stone-400 dark:text-stone-500 select-none">M</span>
        </div>
      </div>

      {/* Seat rows */}
      <div className="flex flex-col gap-1.5">
        {rowGroups.map((rowSeats, rowIdx) => {
          const left = rowSeats.slice(0, leftCount)
          const right = rowSeats.slice(leftCount)

          return (
            <div key={rowIdx} className="flex items-center gap-2">
              {/* Row number */}
              <span className="w-5 text-right text-[10px] text-stone-300 dark:text-stone-600 flex-shrink-0 select-none tabular-nums">
                {rowIdx + 1}
              </span>

              {/* Left seats (window + middle) */}
              <div className="flex gap-1.5">
                {left.map(seat => (
                  <SeatCell
                    key={seat.id}
                    seat={seat}
                    selected={selectedSeat === seat.id}
                    highlighted={!!highlightPassenger && seat.assignment?.passenger_id === highlightPassenger}
                    isCaptain={!!captainPassengerIds?.has(seat.assignment?.passenger_id ?? '')}
                    onClick={() => onSeatClick(seat)}
                  />
                ))}
                {/* Phantom cells if row is short (last row) */}
                {Array.from({ length: Math.max(0, leftCount - left.length) }).map((_, i) => (
                  <div key={`el-${i}`} className={cn(SEAT, 'invisible')} />
                ))}
              </div>

              {/* Aisle */}
              <div className="w-4 self-stretch flex items-center justify-center flex-shrink-0">
                <div className="h-full w-px bg-stone-200 dark:bg-stone-700" />
              </div>

              {/* Right seats (aisle-side + window for bus) */}
              <div className="flex gap-1.5">
                {right.map(seat => (
                  <SeatCell
                    key={seat.id}
                    seat={seat}
                    selected={selectedSeat === seat.id}
                    highlighted={!!highlightPassenger && seat.assignment?.passenger_id === highlightPassenger}
                    isCaptain={!!captainPassengerIds?.has(seat.assignment?.passenger_id ?? '')}
                    onClick={() => onSeatClick(seat)}
                  />
                ))}
                {Array.from({ length: Math.max(0, rightCount - right.length) }).map((_, i) => (
                  <div key={`er-${i}`} className={cn(SEAT, 'invisible')} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-x-4 gap-y-2 mt-5 justify-center flex-wrap">
        <LegendItem color="bg-stone-100 border-stone-300 dark:bg-stone-700 dark:border-stone-600" label="Livre" />
        <LegendItem color="bg-amber-100 border-amber-300 dark:bg-amber-900/30 dark:border-amber-700" label="Ocupado" />
        <LegendItem color="bg-rose-100 border-rose-300 dark:bg-rose-900/30 dark:border-rose-700" label="Pendente" />
        <LegendItem color="bg-emerald-100 border-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-700" label="Pago" />
        {captainPassengerIds && captainPassengerIds.size > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            <Anchor className="w-3 h-3 text-amber-500" />
            Capitão
          </div>
        )}
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
      <div className={cn('w-3.5 h-3.5 rounded border flex-shrink-0', color)} />
      {label}
    </div>
  )
}

function SeatCell({ seat, selected, highlighted, isCaptain, onClick }: {
  seat: SeatWithAssignment
  selected: boolean
  highlighted: boolean
  isCaptain: boolean
  onClick: () => void
}) {
  const occupied = !!seat.assignment
  const paid    = seat.assignment?.payment_status === 'paid'
  const pending = seat.assignment?.payment_status === 'pending'

  return (
    <button
      onClick={onClick}
      title={occupied
        ? `${seat.seat_number} — ${seat.assignment?.passenger?.full_name}${isCaptain ? ' (Capitão)' : ''}`
        : `Assento ${seat.seat_number} — Livre`}
      className={cn(
        'w-11 h-11 rounded-lg border-2 flex flex-col items-center justify-center transition-all flex-shrink-0',
        'focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1',
        'active:scale-95',
        selected   && 'ring-2 ring-amber-500 ring-offset-1 scale-110',
        highlighted && 'ring-2 ring-blue-500 ring-offset-1',
        // Colors — free
        !occupied  && 'bg-stone-50 dark:bg-stone-700 border-stone-300 dark:border-stone-600 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20',
        // Colors — occupied by status
        occupied && !paid && !pending && 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600',
        occupied && paid    && 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700',
        occupied && pending && 'bg-rose-50 dark:bg-rose-900/30 border-rose-300 dark:border-rose-700',
      )}
    >
      <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 leading-none tabular-nums">
        {seat.seat_number}
      </span>
      {occupied && (isCaptain
        ? <Anchor className="w-3 h-3 text-amber-500 dark:text-amber-400 mt-0.5" />
        : <User   className="w-3 h-3 text-stone-400 dark:text-stone-500 mt-0.5" />
      )}
    </button>
  )
}
