import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { EventProvider } from './contexts/EventContext'
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
import { CongregationDetailPage } from './pages/CongregationDetailPage'
import { FinalizedListsPage } from './pages/FinalizedListsPage'
import { AuditPage } from './pages/AuditPage'
import { UsersPage } from './pages/UsersPage'
import { EventsPage } from './pages/EventsPage'
import { TransportCompaniesPage } from './pages/TransportCompaniesPage'
import { RatingsPage } from './pages/RatingsPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { AvailabilityPage } from './pages/AvailabilityPage'
import { RequestAccessPage } from './pages/RequestAccessPage'
import { AccessRequestsPage } from './pages/AccessRequestsPage'
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
      <Route path="/request-access" element={user ? <Navigate to="/dashboard" replace /> : <RequestAccessPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="events" element={<ProtectedRoute adminOnly><EventsPage /></ProtectedRoute>} />
        <Route path="congregations" element={<ProtectedRoute adminOnly><CongregationsPage /></ProtectedRoute>} />
        <Route path="congregations/:id" element={<CongregationDetailPage />} />
        <Route path="users" element={<ProtectedRoute adminOnly><UsersPage /></ProtectedRoute>} />
        <Route path="access-requests" element={<ProtectedRoute adminOnly><AccessRequestsPage /></ProtectedRoute>} />
        <Route path="finalized-lists" element={<ProtectedRoute adminOnly><FinalizedListsPage /></ProtectedRoute>} />
        <Route path="vehicles" element={<VehiclesPage />} />
        <Route path="vehicles/:id" element={<VehicleDetailPage />} />
        <Route path="passengers" element={<PassengersPage />} />
        <Route path="boarding" element={<BoardingPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="transport-companies" element={<ProtectedRoute adminOnly><TransportCompaniesPage /></ProtectedRoute>} />
        <Route path="availability" element={<AvailabilityPage />} />
        <Route path="ratings" element={<RatingsPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
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
          <EventProvider>
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
          </EventProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
