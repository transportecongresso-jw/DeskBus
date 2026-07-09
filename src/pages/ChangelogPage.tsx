import { CheckCircle2, Sparkles } from 'lucide-react'
import { PATCH_NOTES } from '../lib/patchNotes'
import { PageHeader } from '../components/layout/PageHeader'

export function ChangelogPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Histórico de Atualizações"
        subtitle="Todas as versões e novidades do DeskBus"
        icon={<Sparkles className="w-5 h-5" />}
      />

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-stone-100 dark:bg-stone-800 hidden sm:block" />

        <div className="space-y-6">
          {PATCH_NOTES.map((note, idx) => (
            <div key={note.version} className="sm:pl-14 relative">
              {/* Timeline dot */}
              <div className={`absolute left-3 top-4 w-5 h-5 rounded-full border-2 hidden sm:flex items-center justify-center ${
                idx === 0
                  ? 'bg-amber-400 border-amber-400'
                  : 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-600'
              }`}>
                {idx === 0 && <div className="w-2 h-2 bg-amber-950 rounded-full" />}
              </div>

              <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 overflow-hidden">
                {/* Header */}
                <div className={`px-5 py-4 border-b border-stone-100 dark:border-stone-700 ${
                  idx === 0 ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''
                }`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {idx === 0 && (
                      <span className="px-2 py-0.5 bg-amber-400 text-amber-950 text-[10px] font-bold rounded-full uppercase">
                        Versão atual
                      </span>
                    )}
                    <h2 className="font-bold text-stone-800 dark:text-stone-100">{note.title}</h2>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">
                    {new Date(note.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    {' · '}versão {note.version}
                  </p>
                </div>

                {/* Sections */}
                <div className="px-5 py-4 space-y-4">
                  {note.sections.map(section => (
                    <div key={section.heading}>
                      <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
                        {section.heading}
                      </p>
                      <ul className="space-y-2">
                        {section.items.map(item => (
                          <li key={item} className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
