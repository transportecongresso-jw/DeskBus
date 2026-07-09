import { Seat, SeatWithAssignment, Passenger } from '../../types'
import { cn } from '../../lib/utils'
import { User, X, Anchor } from 'lucide-react'

interface SeatMapProps {
  seats: SeatWithAssignment[]
  vehicleType: 'bus' | 'van' | 'microbus'
  onSeatClick: (seat: SeatWithAssignment) => void
  selectedSeat?: string | null
  highlightPassenger?: string | null
  captainPassengerIds?: Set<string>
}

export function SeatMap({ seats, vehicleType, onSeatClick, selectedSeat, highlightPassenger, captainPassengerIds }: SeatMapProps) {
  // Group seats by row
  const rows = seats.reduce<Record<number, SeatWithAssignment[]>>((acc, seat) => {
    const row = seat.row_number
    if (!acc[row]) acc[row] = []
    acc[row].push(seat)
    acc[row].sort((a, b) => a.column_position - b.column_position)
    return acc
  }, {})

  const sortedRows = Object.keys(rows).map(Number).sort((a, b) => a - b)
  const cols = vehicleType === 'van' ? 3 : 4  // bus e microbus usam layout 2+2

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Bus/Van front */}
        <div className="flex justify-center mb-4">
          <div className="px-6 py-2 bg-stone-200 dark:bg-stone-700 rounded-full text-xs font-medium text-stone-500 dark:text-stone-400">
            🚌 Frente do Veículo
          </div>
        </div>

        {/* Driver seat */}
        <div className="flex justify-end mb-2 pr-2">
          <div className="w-10 h-10 bg-stone-300 dark:bg-stone-600 rounded-lg flex items-center justify-center" title="Motorista">
            <span className="text-xs text-stone-500 dark:text-stone-400">M</span>
          </div>
        </div>

        {/* Aisle indicator */}
        <div className={`grid gap-2 mb-2 text-[10px] text-stone-400 text-center`}
          style={{ gridTemplateColumns: cols === 4 ? '1fr 1fr auto 1fr 1fr' : '1fr 1fr auto 1fr' }}>
          <span>Jan.</span>
          <span>Jan.</span>
          <span className="w-6" />
          <span>Jan.</span>
          {cols === 4 && <span>Jan.</span>}
        </div>

        {/* Seat rows */}
        <div className="flex flex-col gap-2">
          {sortedRows.map(rowNum => {
            const rowSeats = rows[rowNum]
            // Split into left and right groups for bus (2+2) or van (2+1)
            const leftCount = 2
            const rightCount = cols === 4 ? 2 : 1
            const left = rowSeats.slice(0, leftCount)
            const right = rowSeats.slice(leftCount, leftCount + rightCount)

            return (
              <div key={rowNum} className="flex items-center gap-2">
                {/* Row number */}
                <span className="text-xs text-stone-300 dark:text-stone-600 w-5 text-right flex-shrink-0">{rowNum}</span>

                {/* Left seats */}
                <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${leftCount}, 1fr)` }}>
                  {left.map(seat => <SeatCell key={seat.id} seat={seat} selected={selectedSeat === seat.id} highlighted={highlightPassenger ? seat.assignment?.passenger_id === highlightPassenger : false} isCaptain={captainPassengerIds ? captainPassengerIds.has(seat.assignment?.passenger_id ?? '') : false} onClick={() => onSeatClick(seat)} />)}
                  {/* Fill empty slots */}
                  {Array.from({ length: Math.max(0, leftCount - left.length) }).map((_, i) => (
                    <div key={`empty-l-${i}`} className="w-10 h-10" />
                  ))}
                </div>

                {/* Aisle */}
                <div className="w-4 h-10 flex items-center justify-center">
                  <div className="h-full w-px bg-stone-200 dark:bg-stone-700" />
                </div>

                {/* Right seats */}
                <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${rightCount}, 1fr)` }}>
                  {right.map(seat => <SeatCell key={seat.id} seat={seat} selected={selectedSeat === seat.id} highlighted={highlightPassenger ? seat.assignment?.passenger_id === highlightPassenger : false} isCaptain={captainPassengerIds ? captainPassengerIds.has(seat.assignment?.passenger_id ?? '') : false} onClick={() => onSeatClick(seat)} />)}
                  {Array.from({ length: Math.max(0, rightCount - right.length) }).map((_, i) => (
                    <div key={`empty-r-${i}`} className="w-10 h-10" />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-6 justify-center flex-wrap">
          <LegendItem color="bg-stone-100 border-stone-300 dark:bg-stone-700 dark:border-stone-600" label="Livre" />
          <LegendItem color="bg-amber-100 border-amber-300 dark:bg-amber-900/30 dark:border-amber-700" label="Ocupado" />
          <LegendItem color="bg-rose-100 border-rose-300 dark:bg-rose-900/30 dark:border-rose-700" label="Pagamento pendente" />
          <LegendItem color="bg-emerald-100 border-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-700" label="Pago" />
          {captainPassengerIds && captainPassengerIds.size > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <Anchor className="w-3 h-3 text-amber-500" />
              Capitão
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-stone-500">
      <div className={cn('w-4 h-4 rounded border', color)} />
      {label}
    </div>
  )
}

function SeatCell({ seat, selected, highlighted, isCaptain, onClick }: {
  seat: SeatWithAssignment; selected: boolean; highlighted: boolean; isCaptain: boolean; onClick: () => void
}) {
  const occupied = !!seat.assignment
  const paid = seat.assignment?.payment_status === 'paid'
  const pending = seat.assignment?.payment_status === 'pending'

  return (
    <button
      onClick={onClick}
      title={occupied ? `${seat.seat_number} — ${seat.assignment?.passenger?.full_name}${isCaptain ? ' (Capitão)' : ''}` : `Assento ${seat.seat_number} — Livre`}
      className={cn(
        'seat w-10 h-10 rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer transition-all',
        'focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1',
        selected && 'ring-2 ring-amber-500 ring-offset-1 scale-110',
        highlighted && 'ring-2 ring-blue-500 ring-offset-1',
        !occupied && 'bg-stone-50 dark:bg-stone-700 border-stone-300 dark:border-stone-600 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20',
        occupied && paid && 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700',
        occupied && pending && 'bg-rose-50 dark:bg-rose-900/30 border-rose-300 dark:border-rose-700',
      )}
    >
      <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 leading-none">{seat.seat_number}</span>
      {occupied && (isCaptain
        ? <Anchor className="w-3 h-3 text-amber-500 dark:text-amber-400 mt-0.5" />
        : <User className="w-3 h-3 text-stone-400 dark:text-stone-500 mt-0.5" />
      )}
    </button>
  )
}
