import { supabase } from './supabase'

export async function logAction(params: {
  congregationId: string
  vehicleId?: string
  actionType: string
  description: string
  performedBy: string
}) {
  await supabase.from('audit_logs').insert({
    congregation_id: params.congregationId,
    vehicle_id: params.vehicleId ?? null,
    action_type: params.actionType,
    description: params.description,
    performed_by: params.performedBy,
  })
}
