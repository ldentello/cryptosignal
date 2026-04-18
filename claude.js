// api/claude.js
// Endpoint seguro — a API Key fica no servidor, nunca exposta ao usuário
// Este arquivo fica na pasta /api dentro do seu projeto

export default async function handler(req, res) {
  // Permitir requisições do seu domínio
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  // Responder preflight do browser
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' })
    return
  }

  try {
    const { messages, system } = req.body

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Campo messages obrigatório' })
      return
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY, // variável segura no Vercel
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001', // modelo mais barato, ideal para volume
        max_tokens: 1000,
        system:     system || 'Você é um analista profissional de criptoativos. Responda sempre em português.',
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      console.error('Anthropic API error:', err)
      res.status(response.status).json({ error: err })
      return
    }

    const data = await response.json()
    res.status(200).json(data)

  } catch (error) {
    console.error('Erro interno:', error)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
