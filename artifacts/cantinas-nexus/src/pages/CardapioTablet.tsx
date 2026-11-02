import { useState } from 'react';
import { TabletSmartphone, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Home } from './Home';
import { PasswordField } from '../components/PasswordField';

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
      // Home e a API pública usam a chave padrão; manter ambas evita perder o tenant no modo kiosk.
      sessionStorage.setItem('nexus:establishmentId', establishmentId);
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
    <div className="nexus-noise relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#172333] px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#ff6b1a]/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-sky-400/10 blur-3xl" />

      <section className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-[0_28px_90px_rgba(0,0,0,.3)]">
        <div className="bg-gradient-to-br from-[#24364b] to-[#172333] px-8 py-8 text-white">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ff6b1a] shadow-lg shadow-orange-950/30">
            <TabletSmartphone className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-orange-300">Nexus • Modo dispositivo</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Conectar tablet</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-300">
            Vincule este aparelho ao estabelecimento usando as credenciais geradas no painel ADM.
          </p>
        </div>

        <div className="p-7 sm:p-8">
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-950">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
            <p>Esta conexão mantém o tablet no cardápio do estabelecimento e permite revogar o dispositivo pelo painel.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 text-left">
            <div>
              <label htmlFor="device-code" className="mb-2 block text-sm font-bold text-slate-700">Código de 6 dígitos</label>
              <input
                id="device-code"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-2xl font-black tracking-[.35em] text-slate-900 focus:border-orange-400 focus:bg-white"
                required
              />
            </div>
            <div>
              <label htmlFor="device-password" className="mb-2 block text-sm font-bold text-slate-700">Senha do dispositivo</label>
              <PasswordField
                id="device-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                placeholder="Digite a senha"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 focus:border-orange-400 focus:bg-white"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-[#f36b21] py-4 text-base font-black text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-[#df5b16] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Conectando ao Nexus…' : 'Conectar dispositivo'}
            </button>
          </form>
          <p className="mt-6 text-center text-xs font-medium text-slate-400">Nexus ERP • Acesso protegido</p>
        </div>
      </section>
    </div>
  );
}
