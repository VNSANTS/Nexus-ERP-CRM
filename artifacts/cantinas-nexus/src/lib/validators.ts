// src/lib/validators.ts
//
// Validações e helpers usados no formulário de solicitação de
// estabelecimento (e reaproveitáveis em outros formulários do Nexus):
// CPF/CNPJ, e-mail, e busca de endereço por CEP via ViaCEP.

export function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

export function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

export function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11
    ? isValidCpf(value)
    : digits.length === 14
      ? isValidCnpj(value)
      : false;
}

export function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidCep(cep: string): boolean {
  return /^\d{8}$/.test(cep.replace(/\D/g, ''));
}

export function formatTelefone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

export type ViaCepResult = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string; // cidade
  uf: string;
  erro?: boolean;
};

export type EnderecoLookupResult =
  | { ok: true; logradouro: string; bairro: string; cidade: string; uf: string }
  | { ok: false; message: string };

/**
 * Busca endereço pelo CEP via ViaCEP (API pública, sem chave).
 * Retorna { ok: false } com mensagem amigável em caso de CEP inválido,
 * não encontrado, ou falha de rede — nunca lança exceção.
 */
export async function lookupCep(cep: string): Promise<EnderecoLookupResult> {
  const digits = cep.replace(/\D/g, '');
  if (!isValidCep(digits)) {
    return { ok: false, message: 'CEP inválido. Digite os 8 números do CEP.' };
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) {
      return { ok: false, message: 'Não foi possível buscar o CEP agora. Tente novamente.' };
    }
    const data: ViaCepResult = await res.json();
    if (data.erro) {
      return { ok: false, message: 'CEP não encontrado.' };
    }
    return {
      ok: true,
      logradouro: data.logradouro ?? '',
      bairro: data.bairro ?? '',
      cidade: data.localidade ?? '',
      uf: data.uf ?? '',
    };
  } catch {
    return { ok: false, message: 'Falha ao consultar o CEP. Verifique sua conexão.' };
  }
}
