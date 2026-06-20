import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Download, Eye, CheckCircle2, Building2, Users, Bus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Congregation, Vehicle } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { exportToExcel, exportToPDF } from '../lib/export'
import { formatCurrency, formatDate } from '../lib/utils'
import toast from 'react-hot-toast'

interface FinalizedCong extends Congregation {
  vehicles: (Vehicle & { assignments: any[]; seats: any[] })[]
  total_passengers: number
  total_paid: number
  finalizer_name: string
}

export function FinalizedListsPage() {
  const { isAdminGeneral } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<FinalizedCong[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: congs } = await supabase
      .from('congregations')
      .select('*')
      .eq('list_status', 'finalized')
      .order('finalized_at', { ascending: false })

    if (!congs || congs.length === 0) { setData([]); setLoading(false); return }

    const finalizerIds = congs.filter(c => c.finalized_by).map(c => c.finalized_by)
    let profiles: any[] = []
    if (finalizerIds.length > 0) {
      const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', finalizerIds)
      profiles = p ?? []
    }

    const congIds = congs.map(c => c.id)
    const { data: vehicles } = await supabase.from('vehicles').select('*').in('congregation_id', congIds)
    const vehicleIds = (vehicles ?? []).map(v => v.id)

    const { data: allAssignments } = vehicleIds.length > 0
      ? await supabase.from('seat_assignments').select('*, passenger:passengers(*)').eq('status', 'active').in('vehicle_id', vehicleIds)
      : { data: [] }
    const { data: allSeats } = vehicleIds.length > 0
      ? await supabase.from('seats').select('*').in('vehicle_id', vehicleIds)
      : { data: [] }

    const result: FinalizedCong[] = congs.map(c => {
      const cVehicles = (vehicles ?? []).filter(v => v.congregation_id === c.id).map(v => ({
        ...v,
        assignments: (allAssignments ?? []).filter(a => a.vehicle_id === v.id),
        seats: (allSeats ?? []).filter(s => s.vehicle_id === v.id),
      }))
      const total = cVehicles.reduce((s, v) => s + v.assignments.length, 0)
      const paid = cVehicles.reduce((s, v) => s + v.assignments.filter((a: any) => a.payment_status === 'paid').length, 0)
      return {
        ...c,
        vehicles: cVehicles,
        total_passengers: total,
        total_paid: paid,
        finalizer_name: profiles.find(p => p.id === c.finalized_by)?.full_name ?? '',
      }
    })

    setData(result)
    setLoading(false)
  }

  async function exportCongregation(cong: FinalizedCong, type: 'excel' | 'pdf') {
    try {
      for (const v of cong.vehicles) {
        const seatMap = v.seats.map((s: any) => ({
          ...s,
          assignment: v.assignments.find((a: any) => a.seat_id === s.id),
        }))
        if (type === 'excel') {
          await exportToExcel(v, v.assignments)
        } else {
          await exportToPDF(v, seatMap)
        }
      }
      toast.success(`Lista de ${cong.name} exportada`)
    } catch {
      toast.error('Erro ao exportar')
    }
  }

  async function exportAll(type: 'excel' | 'pdf') {
    try {
      for (const cong of data) {
        for (const v of cong.vehicles) {
          const seatMap = v.seats.map((s: any) => ({
            ...s,
            assignment: v.assignments.find((a: any) => a.seat_id === s.id),
          }))
          if (type === 'excel') {
            await exportToExcel(v, v.assignments)
          } else {
            await exportToPDF(v, seatMap)
          }
        }
      }
      toast.success(`${data.length} congregações exportadas`)
    } catch {
      toast.error('Erro ao exportar')
    }
  }

  if (!isAdminGeneral) {
    navigate('/dashboard')
    return null
  }

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Listas Finalizadas"
        subtitle="Congregações que finalizaram suas listas de passageiros"
        icon={<CheckCircle2 className="w-6 h-6" />}
        actions={data.length > 0 ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={() => exportAll('excel')}>
              Exportar Tudo (Excel)
            </Button>
            <Button variant="outline" size="sm" icon={<FileText className="w-4 h-4" />} onClick={() => exportAll('pdf')}>
              Exportar Tudo (PDF)
            </Button>
          </div>
        ) : undefined}
      />

      {data.length === 0 ? (
        <Card>
          <div className="text-center py-16 text-stone-400">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma lista finalizada ainda</p>
            <p className="text-xs mt-1">As congregações aparecerão aqui quando finalizarem suas listas</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {data.map(cong => (
            <Card key={cong.id}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-stone-800 dark:text-stone-100">{cong.name}</h3>
                    {cong.city && <span className="text-xs text-stone-400">{cong.city}</span>}
                    <Badge variant="success" dot>Lista Finalizada</Badge>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">
                    Finalizada em {formatDate(cong.finalized_at!)}
                    {cong.finalizer_name && ` · por ${cong.finalizer_name}`}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-stone-500">
                      <Bus className="w-3.5 h-3.5" />
                      {cong.vehicles.length} veículo{cong.vehicles.length !== 1 ? 's' : ''}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500">
                      <Users className="w-3.5 h-3.5" />
                      {cong.total_passengers} passageiro{cong.total_passengers !== 1 ? 's' : ''}
                    </div>
                    <div className="text-xs">
                      <span className="text-emerald-600 font-medium">{cong.total_paid} pagos</span>
                      <span className="text-stone-400 mx-1">·</span>
                      <span className="text-rose-500">{cong.total_passengers - cong.total_paid} pendentes</span>
                    </div>
                  </div>

                  {/* Vehicles breakdown */}
                  {cong.vehicles.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {cong.vehicles.map(v => (
                        <div key={v.id} className="flex items-center gap-3 text-xs text-stone-400 bg-stone-50 dark:bg-stone-700/50 rounded-lg px-3 py-2">
                          <Bus className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="font-medium text-stone-600 dark:text-stone-300">{v.name}</span>
                          <span>{v.assignments.length}/{v.capacity} lugares</span>
                          <span className="text-emerald-600">{v.assignments.filter((a: any) => a.payment_status === 'paid').length} pagos</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />} onClick={() => navigate(`/congregations/${cong.id}`)}>
                    Ver
                  </Button>
                  <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={() => exportCongregation(cong, 'excel')}>
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" icon={<FileText className="w-4 h-4" />} onClick={() => exportCongregation(cong, 'pdf')}>
                    PDF
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
