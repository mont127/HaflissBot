const MODERATION_SYSTEM_PROMPT = [
  "Tu es un modérateur de serveur Discord. Analyse le message suivant et retourne UNIQUEMENT un objet JSON valide, sans explication.",
  "Évalue le message sur ces 2 axes (score de 0 à 100) :",
  "- scam: arnaque, phishing, lien suspect, faux giveaway, crypto, nitro gratuit",
  "- bad_speech: insultes, menaces, harcèlement, grossièretés ciblées, haine",
  "Retourne strictement ce format JSON :",
  '{"scam": <0-100>, "bad_speech": <0-100>, "reasons": ["<raison courte>", ...]}'
].join(" ");

function parseAiScoreResponse(raw) {
  const text = String(raw || "").trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in AI response");

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    scam: Math.max(0, Math.min(100, Number(parsed.scam) || 0)),
    bad_speech: Math.max(0, Math.min(100, Number(parsed.bad_speech) || 0)),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : []
  };
}

function buildModerationResult(scores, thresholds) {
  const flags = [];
  const reasons = [...scores.reasons];

  if (scores.scam >= (thresholds.scamThreshold ?? 55)) flags.push("scam");
  if (scores.bad_speech >= (thresholds.badSpeechThreshold ?? 65)) flags.push("bad_speech");

  return {
    flagged: flags.length > 0,
    flags,
    score: Math.max(scores.scam, scores.bad_speech),
    scamScore: scores.scam,
    badSpeechScore: scores.bad_speech,
    reasons,
    summary: reasons.join(", ") || "aucun signal fort"
  };
}

async function analyzeTextWithAI(text, config, thresholds = {}, fetchImpl = fetch) {
  const content = String(text || "").trim();
  if (!content) {
    return { flagged: false, flags: [], score: 0, reasons: [], summary: "message vide" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiReplyTimeoutMs ?? 12000);

  try {
    const response = await fetchImpl(`${config.ollamaUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.ollamaModel,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: MODERATION_SYSTEM_PROMPT },
          { role: "user", content: content.slice(0, 800) }
        ],
        options: {
          temperature: 0.1,
          num_predict: 120
        }
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Ollama ${response.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
    }

    const payload = await response.json();
    const raw = String(payload?.message?.content || payload?.response || "").trim();
    const scores = parseAiScoreResponse(raw);
    return buildModerationResult(scores, thresholds);
  } catch (error) {
    console.warn(`AI moderation failed, falling back to regex: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { analyzeTextWithAI };
