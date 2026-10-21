import { useState } from 'react';
import { toast } from 'sonner';
import { Home } from './Home';

const DEVICE_TOKEN_KEY = 'nexus:deviceToken';
const DEVICE_ESTABLISHMENT_KEY = 'nexus:deviceEstablishmentId';

// Modo kiosk: tela de login por código (tablet/totem do estabelecimento),
// depois renderiza o Cardápio normal, mas sem nenhuma saída pelo próprio
// dispositivo — só o dono consegue encerrar a sessão remotamente, pelo
// painel ADM. Por isso não há botão de logout nem navegação para fora
// desta rota.
export function CardapioTablet() {
  const [deviceToken, setDeviceToken] = useState<string | null>(
    () => sessionStorage.getItem(DEVICE_TOKEN_KEY),
  );

  if (!deviceToken) {
    return <DeviceLoginScreen onLogin={(token, establishmentId) => {
      sessionStorage.setItem(DEVICE_TOKEN_KEY, token);
      sessionStorage.setItem(DEVICE_ESTABLISHMENT_KEY, establishmentId);
      setDeviceToken(token);
    }} />;
  }

  // A partir daqui, o tablet fica preso no Cardápio — Home já é o
  // componente existente, reaproveitado sem modificação.
  return <Home />;
}

function DeviceLoginScreen({ onLogin }: { onLogin: (token: string, establishmentId: string) => void }) {
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (codigo.replace(/\D/g, '').length !== 6) {
      toast.error('O código tem 6 dígitos.');
      return;
    }
    if (!senha) {
      toast.error('Informe a senha.');
      return;
    }

    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login-dispositivo-cardapio`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ codigo: codigo.replace(/\D/g, ''), senha }),
      });
      const json = await res.json();

      if (!res.ok || json?.error) {
        toast.error(json?.error ?? 'Código ou senha inválidos.');
        return;
      }

      onLogin(json.deviceToken, json.establishmentId);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao conectar. Verifique a internet do dispositivo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">Configurar dispositivo</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Digite o código e a senha gerados pelo estabelecimento.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Código (6 dígitos)</label>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
              className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-center text-2xl tracking-widest"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {submitting ? 'Conectando...' : 'Conectar'}
          </button>
        </form>
      </div>
    </div>
  );
}
