import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(__dirname, '../supabase/schema.sql'), 'utf8')

const PROJECT_URL = 'https://dwzwrsephrjgamvmvyfq.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3endyc2VwaHJqZ2Ftdm12eWZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTk2NzI1MiwiZXhwIjoyMDk3NTQzMjUyfQ.POtDCeQ79Cf9HEu8xkRnoWJ2UItJg1-858PnDTZHoeE'

console.log('⚙️  Executando schema via postgres-meta API...')

const res = await fetch(`${PROJECT_URL}/pg-meta/v1/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'x-connection-encrypted': 'true',
  },
  body: JSON.stringify({ query: sql }),
})

const text = await res.text()
console.log('Status:', res.status)
console.log('Response:', text.slice(0, 500))

if (res.ok) {
  console.log('✅ Schema criado com sucesso!')
} else {
  console.log('❌ Erro. Tentando endpoint alternativo...')

  // Try the REST rpc approach
  const res2 = await fetch(`${PROJECT_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    },
    body: JSON.stringify({ sql }),
  })
  console.log('Status 2:', res2.status)
}
