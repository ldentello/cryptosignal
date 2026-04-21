// api/webhook.js
// Webhook do Stripe — ativado automaticamente quando um pagamento é confirmado
// Este arquivo fica na pasta /api dentro do seu projeto

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Necessário para o Stripe verificar a assinatura do webhook
export const config = { api: { bodyParser: false } }

// Inicializar Stripe e Supabase com variáveis de ambiente do Vercel
const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase  = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // atenção: usar a SERVICE KEY aqui (não a anon key)
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' })
    return
  }

  // Verificar assinatura do Stripe para garantir que a requisição é legítima
  const signature = req.headers['stripe-signature']
  let event

  try {
    // O Stripe envia o body como texto — precisamos do raw body para verificar a assinatura
    event = stripe.webhooks.constructEvent(
      req.body,                           // body raw (string)
      signature,
      process.env.STRIPE_WEBHOOK_SECRET   // whsec_... copiado do painel do Stripe
    )
  } catch (err) {
    console.error('Webhook signature inválida:', err.message)
    res.status(400).json({ error: `Webhook Error: ${err.message}` })
    return
  }

  // ── EVENTOS RELEVANTES ──

  // Pagamento confirmado (checkout concluído)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object

    // O ID do usuário do Supabase foi passado como client_reference_id no link do Stripe
    const userId = session.client_reference_id

    // Detectar o plano pelo valor pago
    const amount = session.amount_total // em centavos
    let plan = 'mensal'
    if (amount >= 199700)     plan = 'vitalicio'  // R$1.997
    else if (amount >= 79700) plan = 'anual'       // R$797

    if (userId) {
      const { error } = await supabase
        .from('profiles')
        .update({
          active:    true,
          plan:      plan,
          stripe_id: session.customer || session.id,
        })
        .eq('id', userId)

      if (error) {
        console.error('Erro ao ativar usuário:', error)
        res.status(500).json({ error: 'Erro ao ativar usuário' })
        return
      }

      console.log(`✓ Usuário ${userId} ativado com plano ${plan}`)
    }
  }

  // Assinatura cancelada ou expirada
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object
    const customerId   = subscription.customer

    // Desativar o usuário que tem esse stripe_id
    const { error } = await supabase
      .from('profiles')
      .update({ active: false })
      .eq('stripe_id', customerId)

    if (error) {
      console.error('Erro ao desativar usuário:', error)
    } else {
      console.log(`✓ Assinatura cancelada para customer ${customerId}`)
    }
  }

  // Pagamento de renovação confirmado (assinatura mensal/anual renovando)
  if (event.type === 'invoice.payment_succeeded') {
    const invoice    = event.data.object
    const customerId = invoice.customer

    // Garantir que o usuário continua ativo após renovação
    await supabase
      .from('profiles')
      .update({ active: true })
      .eq('stripe_id', customerId)
  }

  // Renovação falhou (cartão recusado, etc.)
  if (event.type === 'invoice.payment_failed') {
    const invoice    = event.data.object
    const customerId = invoice.customer

    // Opcional: desativar imediatamente ou aguardar retentativas do Stripe
    // O Stripe tenta cobrar automaticamente por alguns dias antes de cancelar
    console.log(`⚠ Pagamento falhou para customer ${customerId}`)
    // Descomente abaixo se quiser desativar imediatamente:
    // await supabase.from('profiles').update({ active: false }).eq('stripe_id', customerId)
  }

  // Confirmar recebimento para o Stripe
  res.status(200).json({ received: true })
}

// ── CONFIGURAÇÃO IMPORTANTE NO VERCEL ──
// O Vercel parseia o body automaticamente como JSON.
// Para o webhook funcionar, precisamos do raw body.
// Adicione isso no vercel.json na raiz do projeto:
//
// {
//   "functions": {
//     "api/webhook.js": {
//       "bodyParser": false
//     }
//   }
// }
