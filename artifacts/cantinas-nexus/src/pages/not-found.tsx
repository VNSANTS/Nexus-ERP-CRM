import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white rounded-3xl shadow-xl max-w-md w-full">
        <div className="text-6xl mb-4">🍽️</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Página não encontrada</h1>
        <p className="text-gray-500 mb-8">
          Parece que você se perdeu na fila da cantina.
        </p>
        <Link href="/" className="inline-block bg-primary text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-orange-600 transition-colors">
          Voltar para o Cardápio
        </Link>
      </div>
    </div>
  );
}
