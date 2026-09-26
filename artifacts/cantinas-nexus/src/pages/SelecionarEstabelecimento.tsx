import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useCustomerAuth } from '../lib/customer-auth';

type Estabelecimento = {
  id: string;
  apelido: string | null;
  nomeCompleto: string | null;
  enderecoCidade: string | null;
  enderecoUf: string | null;
};

export function SelecionarEstabelecimento() {
  const [, navigate] = useLocation();
  const { session, profile, loading } = useCustomerAuth();

  const [busca, setBusca] = useState('');
  const [estabelecimentos, setEstabelecimentos] = useState<Estabelecimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [scannerAberto, setScannerAberto] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate('/');
      return;
    }
    if (profile && !profile.cadastroCompleto) {
      navigate('/completar-cadastro');
    }
  }, [loading, session, profile, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      buscarEstabelecimentos(busca);
    }, 300);
    return () => clearTimeout(timer);
  }, [busca]);

  async function buscarEstabelecimentos(termo: string) {
    setCarregando(true);
    try {
      // Usamos fetch direto (em vez de supabase.functions.invoke) porque
      // precisamos passar ?busca=... como query param na URL.
      const url = new URL(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/listar-estabelecimentos`,
      );
      if (termo.trim()) url.searchParams.set('busca', termo.trim());

      const res = await fetch(url.toString(), {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      });
      const json = await res.json();

      if (json?.error) {
        toast.error(json.error);
        setEstabelecimentos([]);
        return;
      }
      setEstabelecimentos(json?.estabelecimentos ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível carregar os estabelecimentos.');
    } finally {
      setCarregando(false);
    }
  }

  function abrirEstabelecimento(id: string) {
    navigate(`/e/${id}`);
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold text-neutral-900">Escolha um estabelecimento</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Busque pelo nome ou escaneie o QR code no local.
        </p>

        <div className="mt-6 flex gap-2">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setScannerAberto(true)}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Escanear QR code
          </button>
        </div>

        <div className="mt-6 space-y-2">
          {carregando && <p className="text-sm text-neutral-400">Carregando...</p>}
          {!carregando && estabelecimentos.length === 0 && (
            <p className="text-sm text-neutral-400">Nenhum estabelecimento encontrado.</p>
          )}
          {estabelecimentos.map((est) => (
            <button
              key={est.id}
              type="button"
              onClick={() => abrirEstabelecimento(est.id)}
              className="flex w-full items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm transition hover:shadow-md"
            >
              <div>
                <p className="font-medium text-neutral-900">{est.apelido ?? est.nomeCompleto}</p>
                {est.enderecoCidade && (
                  <p className="text-xs text-neutral-500">
                    {est.enderecoCidade}/{est.enderecoUf}
                  </p>
                )}
              </div>
              <span className="text-neutral-400">→</span>
            </button>
          ))}
        </div>
      </div>

      {scannerAberto && <QrScannerModal onClose={() => setScannerAberto(false)} />}
    </div>
  );
}

// === Leitor de QR code ===
// Detecta o conteúdo lido e roteia: link para /e/{id} abre o cardápio
// daquele estabelecimento; link para /acompanhar/{codigo} abre o
// acompanhamento de pedido.
function QrScannerModal({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch (err) {
        console.error(err);
        setErro('Não foi possível acessar a câmera. Verifique as permissões.');
      }
    }

    function tick() {
      if (cancelled || !videoRef.current) return;
      const video = videoRef.current;

      if (video.readyState === video.HAVE_ENOUGH_DATA && 'BarcodeDetector' in window) {
        // @ts-expect-error BarcodeDetector ainda não está no lib.dom.d.ts padrão
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        detector
          .detect(video)
          .then((codes: Array<{ rawValue: string }>) => {
            if (codes.length > 0) {
              handleResult(codes[0].rawValue);
              return;
            }
            rafRef.current = requestAnimationFrame(tick);
          })
          .catch(() => {
            rafRef.current = requestAnimationFrame(tick);
          });
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    function handleResult(raw: string) {
      cancelled = true;
      try {
        const url = new URL(raw, window.location.origin);
        const path = url.pathname;

        const estMatch = path.match(/\/e\/([a-zA-Z0-9-]+)/);
        const trackMatch = path.match(/\/acompanhar\/([a-zA-Z0-9-]+)/);

        if (estMatch) {
          navigate(`/e/${estMatch[1]}`);
          onClose();
          return;
        }
        if (trackMatch) {
          navigate(`/acompanhar/${trackMatch[1]}`);
          onClose();
          return;
        }
        toast.error('QR code não reconhecido.');
        onClose();
      } catch {
        toast.error('QR code inválido.');
        onClose();
      }
    }

    if (!('BarcodeDetector' in window)) {
      setErro('Seu navegador não suporta leitura de QR code. Tente digitar o link recebido.');
    } else {
      start();
    }

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [navigate, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Escanear QR code</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>

        {erro ? (
          <p className="mt-4 text-sm text-red-600">{erro}</p>
        ) : (
          <video
            ref={videoRef}
            className="mt-4 aspect-square w-full rounded-lg bg-black object-cover"
            muted
            playsInline
          />
        )}
      </div>
    </div>
  );
}
