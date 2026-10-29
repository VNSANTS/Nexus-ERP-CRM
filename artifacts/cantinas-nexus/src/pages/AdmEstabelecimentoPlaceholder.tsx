import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useOwnerAuth } from '../lib/owner-auth';

type Device = {
  id: string;
  codigo: string;
  apelido: string | null;
  ativo: boolean;
  lastLoginAt: string | null;
};

// Painel ADM do estabelecimento — ainda parcial. Hoje cobre a gestão de
// dispositivos (tablets/totens do cardápio). O restante (cardápio,
// estoque, funcionários, pedidos, isolado por establishment_id) é
// construído em uma etapa futura.
export function AdmEstabelecimentoPlaceholder() {
  const [, navigate] = useLocation();
  const { session, establishment, loading } = useOwnerAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session || !establishment) {
      navigate('/estabelecimento/login');
    }
  }, [loading, session, establishment, navigate]);

  useEffect(() => {
    if (establishment) carregarDevices();
  }, [establishment]);

  async function carregarDevices() {
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke('criar-dispositivo-cardapio', {
        body: { action: 'list' },
      });
      if (error || data?.error) {
        toast.error(data?.error ?? 'Não foi possível carregar os dispositivos.');
        return;
      }
      setDevices(data?.devices ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível carregar os dispositivos.');
    } finally {
      setCarregando(false);
    }
  }

  if (loading || !session || !establishment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Painel ADM</h1>
          <button
            type="button"
            onClick={() => navigate('/estabelecimento')}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
          >
            Voltar
          </button>
        </div>

        <p className="mt-2 text-sm text-neutral-500">
          Gerencie os tablets e totens vinculados ao cardápio. Para pedidos,
          equipe, estoque e relatórios, abra o painel de administração e cozinha.
        </p>

        <button
          type="button"
          onClick={() => navigate('/cozinha')}
          className="mt-4 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Abrir administração e cozinha
        </button>

        <DeviceManager devices={devices} carregando={carregando} onChange={carregarDevices} />
      </div>
    </div>
  );
}

function DeviceManager({
  devices,
  carregando,
  onChange,
}: {
  devices: Device[];
  carregando: boolean;
  onChange: () => void;
}) {
  const [criandoAberto, setCriandoAberto] = useState(false);

  return (
    <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-800">Dispositivos do cardápio</h2>
        <button
          type="button"
          onClick={() => setCriandoAberto(true)}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
        >
          + Novo dispositivo
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {carregando && <p className="text-sm text-neutral-400">Carregando...</p>}
        {!carregando && devices.length === 0 && (
          <p className="text-sm text-neutral-400">Nenhum dispositivo cadastrado ainda.</p>
        )}
        {devices.map((d) => (
          <DeviceRow key={d.id} device={d} onChange={onChange} />
        ))}
      </div>

      {criandoAberto && (
        <NovoDispositivoModal
          onClose={() => setCriandoAberto(false)}
          onCriado={() => {
            setCriandoAberto(false);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function DeviceRow({ device, onChange }: { device: Device; onChange: () => void }) {
  const [revogando, setRevogando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function handleRevogar() {
    if (!window.confirm(`Revogar o dispositivo "${device.apelido ?? device.codigo}"? Ele será desconectado do cardápio.`)) {
      return;
    }
    setRevogando(true);
    try {
      const { data, error } = await supabase.functions.invoke('revogar-dispositivo-cardapio', {
        body: { deviceId: device.id },
      });
      if (error || data?.error) {
        toast.error(data?.error ?? 'Não foi possível revogar.');
        return;
      }
      toast.success('Dispositivo revogado.');
      onChange();
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado.');
    } finally {
      setRevogando(false);
    }
  }

  async function handleExcluir() {
    if (!window.confirm(`Excluir definitivamente o dispositivo revogado "${device.apelido ?? device.codigo}"?`)) return;
    setExcluindo(true);
    try {
      const { data, error } = await supabase.functions.invoke('revogar-dispositivo-cardapio', {
        body: { deviceId: device.id, action: 'delete' },
      });
      if (error || data?.error) {
        toast.error(data?.error ?? 'Não foi possível excluir o dispositivo.');
        return;
      }
      toast.success('Dispositivo excluído.');
      onChange();
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado.');
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-neutral-50 p-3">
      <div>
        <p className="text-sm font-medium text-neutral-800">
          {device.apelido ?? 'Sem apelido'} — código {device.codigo}
        </p>
        <p className="text-xs text-neutral-500">
          {device.ativo ? 'Ativo' : 'Revogado'}
          {device.lastLoginAt && ` · último acesso ${new Date(device.lastLoginAt).toLocaleString('pt-BR')}`}
        </p>
      </div>
      {device.ativo ? (
        <button
          type="button"
          disabled={revogando}
          onClick={handleRevogar}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {revogando ? 'Revogando...' : 'Revogar'}
        </button>
      ) : (
        <button
          type="button"
          disabled={excluindo}
          onClick={handleExcluir}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {excluindo ? 'Excluindo...' : 'Excluir'}
        </button>
      )}
    </div>
  );
}

function NovoDispositivoModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [apelido, setApelido] = useState('');
  const [senha, setSenha] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState<{ codigo: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('criar-dispositivo-cardapio', {
        body: { apelido: apelido.trim() || undefined, senha },
      });
      if (error || data?.error) {
        toast.error(data?.error ?? 'Não foi possível criar o dispositivo.');
        return;
      }
      setResultado({ codigo: data.device.codigo });
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        {!resultado ? (
          <>
            <h2 className="text-lg font-semibold text-neutral-900">Novo dispositivo</h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Apelido (opcional)</label>
                <input value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Ex: Tablet do balcão"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Senha</label>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={onClose}
                  className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60">
                  {submitting ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-neutral-900">Dispositivo criado!</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Anote o código abaixo — ele não será mostrado novamente aqui.
            </p>
            <p className="mt-4 rounded-lg bg-neutral-100 py-4 text-center text-3xl font-bold tracking-widest text-neutral-900">
              {resultado.codigo}
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              Digite esse código + a senha definida na tela de login do tablet, na rota /cardapio-tablet.
            </p>
            <a
              href={`${import.meta.env.BASE_URL}cardapio-tablet`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block text-center text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900"
            >
              Abrir configuração do tablet em nova aba
            </a>
            <button type="button" onClick={onCriado}
              className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800">
              Concluir
            </button>
          </>
        )}
      </div>
    </div>
  );
}
