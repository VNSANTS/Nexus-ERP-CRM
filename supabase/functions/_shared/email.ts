// supabase/functions/_shared/email.ts
//
// Envio de e-mail via Resend, usado no fluxo de solicitação/aprovação de
// estabelecimento.

export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY não configurada.');

  const fromAddress = Deno.env.get('RESEND_FROM') ?? 'Nexus <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao enviar e-mail via Resend: ${res.status} ${text}`);
  }
}
