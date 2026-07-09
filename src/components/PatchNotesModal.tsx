import { Sparkles, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { PatchNote } from '../lib/patchNotes'
import { Button } from './ui/Button'

interface Props {
  notes: PatchNote[]
  onDismiss: () => void
}

export function PatchNotesModal({ notes, onDismiss }: Props) {
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    () => new Set([notes[0]?.version])
  )

  function toggle(version: string) {
    setExpandedVersions(prev => {
      const next = new Set(prev)
      next.has(version) ? next.delete(version) : next.add(version)
      return next
    })
  }

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full sm:max-w-lg bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh]">

        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-amber-950" />
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                {notes.length === 1 ? 'Nova versão disponível' : `${notes.length} versões novas`}
              </p>
              <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 leading-tight">
                Novidades do DeskBus
              </h2>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {notes.map((note, idx) => {
            const isOpen = expandedVersions.has(note.version)
            const isFirst = idx === 0
            return (
              <div
                key={note.version}
                className={`rounded-2xl border transition-all ${
                  isFirst
                    ? 'border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
                    : 'border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50'
                }`}
              >
                {/* Version header — clickable when multiple */}
                <button
                  onClick={() => notes.length > 1 && toggle(note.version)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left ${notes.length > 1 ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {isFirst && (
                        <span className="px-2 py-0.5 bg-amber-400 text-amber-950 text-[10px] font-bold rounded-full uppercase">
                          Novo
                        </span>
                      )}
                      <span className="text-sm font-bold text-stone-800 dark:text-stone-100">
                        {note.title}
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {new Date(note.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  {notes.length > 1 && (
                    isOpen
                      ? <ChevronUp className="w-4 h-4 text-stone-400 flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />
                  )}
                </button>

                {/* Sections */}
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {note.sections.map(section => (
                      <div key={section.heading}>
                        <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
                          {section.heading}
                        </p>
                        <ul className="space-y-1.5">
                          {section.items.map(item => (
                            <li key={item} className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 pb-6 pt-4 border-t border-stone-100 dark:border-stone-800">
          <Button onClick={onDismiss} className="w-full" size="lg">
            Entendi
          </Button>
          <p className="text-center text-xs text-stone-400 mt-2">
            Acesse o histórico completo em <span className="font-medium">Configurações → Histórico de Atualizações</span>
          </p>
        </div>
      </div>
    </div>
  )
}
