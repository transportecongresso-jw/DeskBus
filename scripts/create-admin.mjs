const PROJECT_URL = 'https://dwzwrsephrjgamvmvyfq.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3endyc2VwaHJqZ2Ftdm12eWZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTk2NzI1MiwiZXhwIjoyMDk3NTQzMjUyfQ.POtDCeQ79Cf9HEu8xkRnoWJ2UItJg1-858PnDTZHoeE'

const EMAIL = 'transportecongresso@gmail.com'
const PASSWORD = 'TTL@tr1020'
const FULL_NAME = 'Administrador Geral'

console.log('👤 Criando usuário Admin Geral...')

// Create user via Supabase Admin API
const res = await fetch(`${PROJECT_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey': SERVICE_KEY,
  },
  body: JSON.stringify({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME, role: 'admin_general' },
  }),
})

const data = await res.json()

if (!res.ok) {
  console.error('❌ Erro ao criar usuário:', data)
  process.exit(1)
}

const userId = data.id
console.log('✅ Usuário criado! ID:', userId)

// Update profile to admin_general
console.log('🔧 Promovendo para Admin Geral...')
const res2 = await fetch(`${PROJECT_URL}/rest/v1/profiles?id=eq.${userId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey': SERVICE_KEY,
    'Prefer': 'return=representation',
  },
  body: JSON.stringify({ role: 'admin_general', full_name: FULL_NAME }),
})

const data2 = await res2.json()

if (!res2.ok) {
  console.error('❌ Erro ao atualizar perfil:', data2)
  process.exit(1)
}

console.log('✅ Admin Geral configurado com sucesso!')
console.log('')
console.log('🎉 DeskBus pronto para uso!')
console.log(`   E-mail: ${EMAIL}`)
console.log(`   Senha:  ${PASSWORD}`)
