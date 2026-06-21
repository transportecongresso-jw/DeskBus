import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { MobileEventHeader } from './MobileEventHeader'

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-stone-50 dark:bg-stone-950">
      {/* Sidebar — hidden on mobile, visible on lg+ */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Mobile event header — sticky, only on small screens */}
        <MobileEventHeader />

        <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full pb-28 lg:pb-8">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav — mobile only */}
      <BottomNav />
    </div>
  )
}
