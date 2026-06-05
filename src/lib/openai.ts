import { ParsedTransaction } from './types';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY!;

function buildSystemPrompt(defaultCurrency: string): string {
  return `Tu es un assistant financier. Extrais les informations de cette phrase et retourne UNIQUEMENT un JSON valide, sans markdown, sans explication.

Format exact :
{
  "amount": number,
  "currency": "CHF" | "EUR" | "USD",
  "type": "expense" | "income" | "debt" | "transfer",
  "category": string,
  "payment_method": "cash" | "card" | "transfer" | "unknown",
  "scope": "personal" | "business" | "family",
  "description_clean": string,
  "is_recurring": boolean,
  "recurrence_interval": "daily" | "weekly" | "monthly" | "yearly" | null
}

Devise par défaut si l'utilisateur n'en mentionne pas : ${defaultCurrency}

Règles pour is_recurring :
- true si la transaction est clairement périodique : loyer, salaire, abonnement, assurance, crédit, cotisation
- false pour les achats ponctuels : courses, restaurant, taxi, achat unique

Catégories (choisis toujours la plus proche, ne retourne JAMAIS "unknown") :
Loyer, Courses, Transport, Restaurant, Salaire, Freelance, Santé, Abonnement, Vêtements, Loisirs, Voyage, Éducation, Assurance, Banque, Cadeaux, Électronique, Carburant, Parking, Sport, Beauté, Animaux, Impôts, Divers

Si aucune catégorie ne convient exactement, utilise "Divers".`;
}

export async function transcribeAudio(source: string | Blob): Promise<string> {
  const formData = new FormData();

  if (typeof source === 'string') {
    // Mobile: URI from expo-av
    formData.append('file', {
      uri: source,
      type: 'audio/m4a',
      name: 'audio.m4a',
    } as unknown as Blob);
  } else {
    // Web: Blob from MediaRecorder
    const ext = source.type.includes('ogg') ? 'ogg' : 'webm';
    formData.append('file', source, `audio.${ext}`);
  }

  formData.append('model', 'whisper-1');
  formData.append('language', 'fr');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Whisper ${response.status}: ${body.slice(0, 120)}`);
  }

  const data = await response.json();
  return data.text as string;
}

export async function parseTransaction(text: string, defaultCurrency = 'CHF'): Promise<ParsedTransaction> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: buildSystemPrompt(defaultCurrency) },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GPT ${response.status}: ${body.slice(0, 120)}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content as string;

  try {
    return JSON.parse(content) as ParsedTransaction;
  } catch {
    throw new Error('Format de réponse invalide');
  }
}
