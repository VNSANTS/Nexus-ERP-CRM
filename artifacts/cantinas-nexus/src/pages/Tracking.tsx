import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { api, formatCurrency, computeOrderEta, type ApiOrder } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, CheckCircle2, ChefHat, Package, Loader2, AlertCircle } from 'lucide-react';

const STATUS_FLOW = ['recebido', 'preparo', 'pronto', 'retirado'] as const;

const STATUS_INFO: Record<string, { label: string; description: string; icon: typeof Clock; color: string; bg: string }> = {
  recebido: {
    label: 'Pedido Recebido',
    description: 'Seu pedido foi confirmado e está na fila de preparo.',
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
  },
  preparo: {
    label: 'Em Preparo',
    description: 'Nossa equipe está preparando seu pedido com carinho.',
    icon: ChefHat,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
  },
  pronto: {
    label: 'Pronto para Retirada!',
    description: 'Seu pedido está pronto. Retire no balcão com seu número.',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  retirado: {
    label: 'Retirado',
    description: 'Pedido entregue. Bom apetite!',
    icon: Package,
    color: 'text-gray-600',
    bg: 'bg-gray-50 border-gray-200',
  },
  cancelado: {
    label: 'Cancelado',
    description: 'Este pedido foi cancelado.',
    icon: AlertCircle,
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200',
  },
};

export function Tracking() {
  const { codigo } = useParams<{ codigo: string }>();

  const { data: order, isLoading, error } = useQuery<ApiOrder>({
    queryKey: ['order-tracking', codigo],
    queryFn: () => api.orders.byCode(codigo ?? ''),
    refetchInterval: 4000, // poll every 4s
    enabled: !!codigo,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: api.products.list,
    staleTime: 60_000,
  });

  const eta = order && products.length > 0 && (order.status === 'recebido' || order.status === 'preparo')
    ? computeOrderEta(order, products)
    : null;

  const currentStepIndex = order ? STATUS_FLOW.indexOf(order.status as typeof STATUS_FLOW[number]) : -1;
  const info = order ? STATUS_INFO[order.status] : null;

  return (
    <div className="nexus-noise min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <header className="px-4 sm:px-8 pt-6 pb-4 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-bold text-base px-4 py-3 rounded-2xl hover:bg-accent transition-colors">
            <ArrowLeft className="w-5 h-5" /> Voltar
        </Link>
        <div className="flex-1">
           <h1 className="text-xl sm:text-3xl font-display font-extrabold text-foreground">Acompanhe seu pedido</h1>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-8 pb-12 flex flex-col items-center justify-start pt-4 sm:pt-8 gap-6 max-w-2xl mx-auto w-full">
        {isLoading && (
          <div className="flex flex-col items-center gap-4 py-24">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
            <p className="text-muted-foreground font-bold text-lg">Buscando seu pedido...</p>
          </div>
        )}

        {error && !isLoading && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] p-8 sm:p-12 text-center shadow-2xl w-full">
            <div className="w-16 h-16 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center"><AlertCircle className="w-8 h-8 text-primary" /></div>
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">Pedido não encontrado</h2>
            <p className="text-gray-500 mb-6">O código <strong className="font-mono">{codigo}</strong> não corresponde a nenhum pedido de hoje.</p>
             <Link href="/" className="inline-flex bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-orange-600 transition-colors">Voltar ao Cardápio</Link>
          </motion.div>
        )}

        {order && info && (
          <AnimatePresence mode="wait">
            <motion.div key={order.status} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full flex flex-col gap-6">
              {/* Order code + status card */}
                 <div className="nexus-surface rounded-[2rem] p-8 sm:p-10 text-center">
                <p className="text-gray-500 font-bold text-base uppercase tracking-widest mb-2">Pedido Nº</p>
                   <div className="text-7xl sm:text-9xl font-display font-black text-primary mb-2 leading-none">{order.code}</div>
                <p className="font-mono text-sm text-gray-400 font-bold mb-6">{order.paymentCode}</p>

                {/* Status badge */}
                <div className={`inline-flex items-center gap-3 px-6 py-4 rounded-2xl border-2 ${info.bg} mb-6`}>
                  {order.status === 'pronto' ? (
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                      <CheckCircle2 className={`w-7 h-7 ${info.color}`} />
                    </motion.div>
                  ) : (
                    <info.icon className={`w-7 h-7 ${info.color}`} />
                  )}
                  <div className="text-left">
                    <p className={`font-black text-lg sm:text-xl ${info.color}`}>{info.label}</p>
                    <p className="text-gray-600 text-sm font-medium">{info.description}</p>
                  </div>
                </div>

                {/* ETA */}
                {eta && (
                  <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl px-6 py-4 inline-flex items-center gap-3">
                    <Clock className="w-5 h-5 text-primary" />
                    <p className="text-primary font-bold">Previsão: <strong>{eta.min}–{eta.max} min</strong></p>
                  </div>
                )}
              </div>

              {/* Progress steps */}
              {order.status !== 'cancelado' && (
                 <div className="nexus-surface rounded-[2rem] p-6 sm:p-8">
                  <h3 className="text-lg font-display font-bold text-gray-700 mb-6 text-center uppercase tracking-wider">Progresso do Pedido</h3>
                  <div className="flex items-start gap-0">
                    {STATUS_FLOW.map((s, idx) => {
                      const isCompleted = currentStepIndex > idx;
                      const isCurrent = currentStepIndex === idx;
                      const isLast = idx === STATUS_FLOW.length - 1;
                      return (
                        <div key={s} className="flex-1 flex flex-col items-center">
                          <div className="flex items-center w-full">
                            <motion.div
                              animate={isCurrent ? { scale: [1, 1.15, 1] } : {}}
                              transition={{ repeat: Infinity, duration: 1.5 }}
                              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-base border-4 transition-all z-10 ${
                                isCompleted ? 'bg-success border-success text-white' :
                                isCurrent ? 'bg-primary border-primary text-white shadow-lg shadow-primary/40' :
                                'bg-gray-100 border-gray-200 text-gray-400'
                              }`}>
                              {isCompleted ? '✓' : idx + 1}
                            </motion.div>
                            {!isLast && <div className={`flex-1 h-1 ${isCompleted ? 'bg-success' : 'bg-gray-200'} transition-colors`} />}
                          </div>
                          <p className={`mt-3 text-[11px] sm:text-xs font-bold text-center ${isCurrent ? 'text-primary' : isCompleted ? 'text-success' : 'text-gray-400'}`}>
                            {s === 'recebido' ? 'Recebido' : s === 'preparo' ? 'Em Preparo' : s === 'pronto' ? 'Pronto!' : 'Retirado'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Order items */}
               <div className="nexus-surface rounded-[2rem] p-6 sm:p-8">
                <h3 className="text-lg font-display font-bold text-gray-700 mb-4 uppercase tracking-wider">Itens do Pedido</h3>
                <div className="space-y-3 mb-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <span className="font-bold text-gray-900">{item.name}</span>
                        <span className="text-gray-400 ml-2 text-sm">× {item.qty}</span>
                      </div>
                      <span className="font-black text-primary">{formatCurrency(Number(item.price) * item.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2 border-t-2 border-gray-100">
                  <span className="text-xl font-bold text-gray-700">Total</span>
                  <span className="text-2xl font-black text-primary">{formatCurrency(Number(order.total))}</span>
                </div>
                {order.observacoes && (
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                     <p className="text-amber-800 text-sm font-medium"><strong>Obs:</strong> {order.observacoes}</p>
                  </div>
                )}
              </div>

              {/* Auto-refresh note */}
               <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm font-medium">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                  <Loader2 className="w-4 h-4" />
                </motion.div>
                Atualizando automaticamente…
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
