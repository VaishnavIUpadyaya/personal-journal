import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase Admin App for token verification
const adminApp = !getApps().length
  ? initializeApp({ projectId: firebaseConfig.projectId })
  : getApp();

// Resilient Gemini Initialization with fallback ladder
const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
];

const MAX_RETRIES_PER_MODEL = 2; // Initial attempt + 1 retry with exponential backoff
const INITIAL_BACKOFF_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const errorObj = err as { status?: number; statusCode?: number; code?: number | string; message?: string };
  const status = errorObj.status || errorObj.statusCode;
  const message = (errorObj.message || '').toLowerCase();

  if (status === 503 || status === 429 || status === 500 || status === 504) return true;
  if (typeof errorObj.code === 'number' && [503, 429, 500, 504].includes(errorObj.code)) return true;
  if (typeof errorObj.code === 'string' && (errorObj.code.includes('UNAVAILABLE') || errorObj.code.includes('RESOURCE_EXHAUSTED') || errorObj.code.includes('DEADLINE_EXCEEDED'))) return true;

  if (
    message.includes('503') ||
    message.includes('unavailable') ||
    message.includes('high demand') ||
    message.includes('overloaded') ||
    message.includes('resource exhausted') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('try again later') ||
    message.includes('quota') ||
    message.includes('internal error')
  ) {
    return true;
  }

  return false;
}

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY server environment variable is not configured');
  }
  return new GoogleGenAI({ apiKey });
}

interface GenerateOptions {
  systemInstruction?: string;
  responseSchema?: Record<string, unknown>;
  responseMimeType?: string;
  temperature?: number;
}

async function generateContentWithFallback(
  contents: string | Array<{ role?: string; parts: Array<{ text: string }> }>,
  options: GenerateOptions = {}
): Promise<{ text: string; modelUsed: string }> {
  const ai = getGenAI();
  let lastError: unknown = null;

  for (let modelIdx = 0; modelIdx < FALLBACK_MODELS.length; modelIdx++) {
    const model = FALLBACK_MODELS[modelIdx];

    for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        const config: Record<string, unknown> = {};
        if (options.systemInstruction) {
          config.systemInstruction = options.systemInstruction;
        }
        if (options.responseSchema) {
          config.responseSchema = options.responseSchema;
        }
        if (options.responseMimeType) {
          config.responseMimeType = options.responseMimeType;
        }
        if (options.temperature !== undefined) {
          config.temperature = options.temperature;
        }

        const response = await ai.models.generateContent({
          model,
          contents,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        if (response && response.text) {
          if (modelIdx > 0) {
            console.log(`[Gemini Fallback] Successfully served request using fallback model: ${model} (escalated from ${FALLBACK_MODELS[0]})`);
          } else {
            console.log(`[Gemini Gateway] Successfully served request with primary model: ${model}`);
          }
          return { text: response.text, modelUsed: model };
        }
      } catch (err: unknown) {
        lastError = err;
        const errMsg = (err as Error)?.message || String(err);
        const isTransient = isTransientError(err);

        console.warn(`[Gemini Fallback] Model ${model} (attempt ${attempt}/${MAX_RETRIES_PER_MODEL}) encountered error: ${errMsg}`);

        if (isTransient && attempt < MAX_RETRIES_PER_MODEL) {
          const jitter = Math.floor(Math.random() * 200);
          const backoffDelay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1) + jitter;
          console.warn(`[Gemini Fallback] Transient/503 error detected on ${model}. Retrying with exponential backoff in ${backoffDelay}ms...`);
          await sleep(backoffDelay);
        } else {
          // If not transient or retries exhausted for this model, break to try next fallback model
          break;
        }
      }
    }

    if (modelIdx < FALLBACK_MODELS.length - 1) {
      console.warn(`[Gemini Fallback] Escalating from ${model} to next Flash fallback model: ${FALLBACK_MODELS[modelIdx + 1]}`);
    }
  }

  throw new Error(`All Gemini fallback models exhausted. Last error: ${(lastError as Error)?.message || 'Unknown error'}`);
}

// Authentication Middleware to verify Firebase Auth ID token
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    name?: string;
  };
}

async function verifyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1].trim();
  if (!idToken) {
    res.status(401).json({ success: false, error: 'Empty token provided' });
    return;
  }

  try {
    const decodedToken = await getAuth(adminApp).verifyIdToken(idToken);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name || '',
    };
    next();
  } catch (err) {
    console.error('Firebase ID token verification failed:', (err as Error)?.message || err);
    res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '5mb' }));

  // API HEALTH
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Personal Gemini Journal Gateway',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // INITIAL REFLECTION & METADATA GENERATION
  app.post('/api/ai/initial-reflection', verifyAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const { prompt, mood = 'reflective', title } = body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ success: false, error: 'Prompt is required' });
        return;
      }

      const cleanPrompt = prompt.trim().slice(0, 10000);

      // Conversational reflection response
      const systemInstruction = `You are a thoughtful, empathetic, and insight-oriented Personal Journal Assistant.
Help the user reflect deeper, unpack emotional layers, understand patterns, and find clarity.
Keep your conversational response engaging, warm, grounded, and concise (2-4 paragraphs max). Avoid clinical jargon.`;

      let aiResponse: { text: string; modelUsed: string };
      try {
        aiResponse = await generateContentWithFallback(cleanPrompt, {
          systemInstruction,
          temperature: 0.7,
        });
      } catch (genErr) {
        console.error('[Gemini Gateway] All fallback models exhausted for initial reflection:', (genErr as Error)?.message);
        aiResponse = {
          text: `Thank you for taking the time to write this reflection. Your entry has been safely captured.\n\nWhile the AI assistant is temporarily experiencing high global demand, your thoughts and emotional context are securely stored. You can continue adding notes or return to this thread anytime.`,
          modelUsed: 'gemini-resilience-safeguard',
        };
      }

      // Generate title, preview, and tags
      const metadataPrompt = `Analyze this user journal reflection and AI response. Generate a concise title (3-6 words), a 1-sentence preview summary, and 2-4 relevant tags.
User: "${cleanPrompt}"
AI: "${aiResponse.text.slice(0, 500)}"`;

      let generatedTitle = title || 'Reflection & Dialogue';
      let previewText = cleanPrompt.slice(0, 120);
      let tags = ['Journal', mood];

      try {
        const metadataResult = await generateContentWithFallback(metadataPrompt, {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              preview: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['title', 'preview', 'tags'],
          },
        });

        const parsed = JSON.parse(metadataResult.text);
        if (parsed.title) generatedTitle = parsed.title.slice(0, 80);
        if (parsed.preview) previewText = parsed.preview.slice(0, 150);
        if (Array.isArray(parsed.tags)) tags = parsed.tags.slice(0, 5);
      } catch (metaErr) {
        console.warn('Metadata generation fallback:', (metaErr as Error).message);
      }

      res.json({
        success: true,
        data: {
          title: generatedTitle,
          preview: previewText,
          summary: previewText,
          mood: mood || 'reflective',
          tags,
          modelResponse: aiResponse.text,
          modelUsed: aiResponse.modelUsed,
        }
      });
    } catch (err) {
      console.error('Error generating initial reflection:', err);
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // MULTI-TURN MESSAGE GENERATION
  app.post('/api/ai/turn', verifyAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const { history, newMessage } = body;

      if (!newMessage || typeof newMessage !== 'string' || !newMessage.trim()) {
        res.status(400).json({ success: false, error: 'newMessage is required' });
        return;
      }

      const cleanNewMessage = newMessage.trim().slice(0, 10000);
      const pastMessages: Array<{ role: string; content: string }> = Array.isArray(history) ? history : [];

      const contentsPayload: Array<{ role?: string; parts: Array<{ text: string }> }> = [];

      for (const msg of pastMessages) {
        contentsPayload.push({
          role: msg.role === 'model' ? 'model' : 'user',
          parts: [{ text: String(msg.content || '') }],
        });
      }

      contentsPayload.push({
        role: 'user',
        parts: [{ text: cleanNewMessage }],
      });

      const systemInstruction = `You are a thoughtful, empathetic Personal Journal Assistant.
Continue the multi-turn reflection dialogue with the user. Help them explore their insights, thoughts, emotional patterns, and practical intentions.
Respond with warmth, nuance, and concise paragraphs.`;

      const aiResponse = await generateContentWithFallback(contentsPayload, {
        systemInstruction,
        temperature: 0.7,
      });

      res.json({
        success: true,
        data: {
          content: aiResponse.text,
          modelUsed: aiResponse.modelUsed,
        },
      });
    } catch (err) {
      console.error('Error in AI turn:', err);
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // GENERATE ENTRY SUMMARY & TAGS
  app.post('/api/ai/summarize', verifyAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const { dialogue } = body;

      if (!dialogue || typeof dialogue !== 'string') {
        res.status(400).json({ success: false, error: 'dialogue text is required' });
        return;
      }

      const summaryPrompt = `Analyze the following multi-turn personal journal reflection. Produce a comprehensive, concise structured summary:
1. summary: A clean 2-3 sentence executive reflection summary.
2. keyTakeaways: 3 key realizations or insights.
3. mood: Best matching mood ('reflective', 'energized', 'calm', 'challenged', 'grateful', 'focused').
4. tags: 3-5 keywords.

Dialogue:
${dialogue.slice(0, 15000)}`;

      const summaryResult = await generateContentWithFallback(summaryPrompt, {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
            mood: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['summary', 'keyTakeaways', 'mood', 'tags'],
        },
      });

      const parsed = JSON.parse(summaryResult.text);

      res.json({
        success: true,
        data: {
          summary: parsed.summary,
          mood: parsed.mood || 'reflective',
          tags: parsed.tags || [],
          keyTakeaways: parsed.keyTakeaways || [],
        },
      });
    } catch (err) {
      console.error('Error in AI summarization:', err);
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // PERSONAL GROWTH INTELLIGENCE: COGNITIVE PATTERN & LONGITUDINAL ANALYSIS
  app.post('/api/ai/growth-insights', verifyAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const { entries, timeframeDays = 30 } = body;

      if (!Array.isArray(entries) || entries.length === 0) {
        res.status(400).json({
          success: false,
          error: `No journal entries found in the last ${timeframeDays} days to analyze.`,
        });
        return;
      }

      const prompt = `You are a Personal Growth Intelligence Engine. You are analyzing the authenticated user's personal journal history from the last ${timeframeDays} days.
Your goal is to extract deep self-awareness, detect longitudinal patterns, spot recurring themes, evaluate emotional trends, highlight active aspirations/goals, uncover systemic blockers, and offer concrete actionable next steps.

Journal History Data (${entries.length} entries):
${JSON.stringify(entries, null, 2).slice(0, 20000)}

Output must be strict JSON matching this exact schema:
- timeframeDays: number (${timeframeDays})
- timeframeLabel: string ("Last ${timeframeDays} Days")
- entriesAnalyzedCount: number (${entries.length})
- recurringThemes: Array<{ theme: string, frequency: "high" | "moderate" | "emerging", description: string }> (2 to 4 items)
- moodPatterns: { dominantMood: string, stabilityScore: number (1-10), observations: string }
- goals: Array<{ goal: string, status: "in_progress" | "achieved" | "stalled", context: string }> (2 to 4 items)
- blockers: Array<{ blocker: string, suggestedRemedy: string }> (1 to 3 items)
- actionableNextSteps: Array<{ step: string, priority: "high" | "medium", rationale: string }> (3 to 5 items)
- weeklyReflection: string (a profound 2-3 paragraph synthesis message offering stoic clarity, encouragement, and mindful perspective)`;

      const insightResult = await generateContentWithFallback(prompt, {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            timeframeDays: { type: Type.INTEGER },
            timeframeLabel: { type: Type.STRING },
            entriesAnalyzedCount: { type: Type.INTEGER },
            recurringThemes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  theme: { type: Type.STRING },
                  frequency: { type: Type.STRING, enum: ['high', 'moderate', 'emerging'] },
                  description: { type: Type.STRING },
                },
                required: ['theme', 'frequency', 'description'],
              },
            },
            moodPatterns: {
              type: Type.OBJECT,
              properties: {
                dominantMood: { type: Type.STRING },
                stabilityScore: { type: Type.NUMBER },
                observations: { type: Type.STRING },
              },
              required: ['dominantMood', 'stabilityScore', 'observations'],
            },
            goals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  goal: { type: Type.STRING },
                  status: { type: Type.STRING, enum: ['in_progress', 'achieved', 'stalled'] },
                  context: { type: Type.STRING },
                },
                required: ['goal', 'status', 'context'],
              },
            },
            blockers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  blocker: { type: Type.STRING },
                  suggestedRemedy: { type: Type.STRING },
                },
                required: ['blocker', 'suggestedRemedy'],
              },
            },
            actionableNextSteps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  step: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ['high', 'medium'] },
                  rationale: { type: Type.STRING },
                },
                required: ['step', 'priority', 'rationale'],
              },
            },
            weeklyReflection: { type: Type.STRING },
          },
          required: [
            'timeframeDays',
            'timeframeLabel',
            'entriesAnalyzedCount',
            'recurringThemes',
            'moodPatterns',
            'goals',
            'blockers',
            'actionableNextSteps',
            'weeklyReflection'
          ],
        },
      });

      const parsedInsight = JSON.parse(insightResult.text);

      res.json({
        success: true,
        data: parsedInsight,
      });
    } catch (err) {
      console.error('Error generating growth insights:', err);
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // Create HTTP server to bind Express and WebSocket upgrade handlers
  const httpServer = createHttpServer(app);

  // Vite middleware in dev or static files in prod
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Cloud Run AI Gateway] Personal Gemini Journal running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
});
