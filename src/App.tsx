import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { CongregationsPage } from './pages/CongregationsPage'
import { VehiclesPage } from './pages/VehiclesPage'
import { VehicleDetailPage } from './pages/VehicleDetailPage'
import { PassengersPage } from './pages/PassengersPage'
import { BoardingPage } from './pages/BoardingPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { PageSpinner } from './components/ui/Spinner'

const queryClient = new QueryClient()

function ProtectedRoute({ children, adminOnly }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && profile?.role !== 'admin_general') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <PageSpinner />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="congregations" element={<ProtectedRoute adminOnly><CongregationsPage /></ProtectedRoute>} />
        <Route path="vehicles" element={<VehiclesPage />} />
        <Route path="vehicles/:id" element={<VehicleDetailPage />} />
        <Route path="passengers" element={<PassengersPage />} />
        <Route path="boarding" element={<BoardingPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  borderRadius: '12px',
                  background: '#1c1917',
                  color: '#fafaf9',
                  fontSize: '14px',
                },
                success: { iconTheme: { primary: '#fbbf24', secondary: '#1c1917' } },
                error: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } },
              }}
            />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
