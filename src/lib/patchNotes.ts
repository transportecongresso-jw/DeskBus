export interface PatchNote {
  version: string
  title: string
  date: string
  sections: {
    heading: string
    items: string[]
  }[]
}

// Add new versions at the TOP of this array.
// The version string is used as the unique key to track reads per user.
export const PATCH_NOTES: PatchNote[] = [
  {
    version: 'alpha-1.0',
    title: 'DeskBus Alpha 1.0 — Capitania e Capitães',
    date: '2026-07-08',
    sections: [
      {
        heading: '🚢 Módulo Capitania',
        items: [
          'Nova função "Capitão": acesso operacional para o dia do embarque',
          'Painel mobile-first com lista de veículos da congregação',
          'Checklist de embarque: marcar presença ou ausência com observação',
          'Controle de viagem: Iniciar Embarque → Partir → Chegada → Retorno → Chegada',
          'Adição de passageiros substitutos diretamente pelo capitão',
          'Notificações automáticas enviadas aos administradores a cada ação',
          'Sons de feedback para embarque, ausência, partida e chegada',
        ],
      },
      {
        heading: '🔐 Solicitações de Acesso',
        items: [
          'Administradores de congregação agora podem aprovar capitães da sua congregação',
          'Página de solicitação atualizada: seleção de congregação e tipo de cargo',
          'Badge de notificação filtrado por perfil do usuário',
        ],
      },
      {
        heading: '🛠 Melhorias e Correções',
        items: [
          'Embarque: veículos sem dia específico agora aparecem na seção "Todos os dias"',
          'Botão "Fechar Lista de Passageiros" adicionado diretamente na tela do veículo',
          'Filtragem automática de passageiros por dia do veículo em todos os pontos do sistema',
          'Edição de capacidade do veículo sincroniza o mapa de assentos automaticamente',
          'Bloqueio de redução de capacidade quando há passageiros nos assentos removidos',
        ],
      },
    ],
  },
]

export const LATEST_VERSION = PATCH_NOTES[0].version
