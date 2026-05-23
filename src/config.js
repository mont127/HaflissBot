require("dotenv").config();

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(raw.toLowerCase());
}

function listFromEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = {
  discordToken: process.env.DISCORD_TOKEN || "",
  modLogChannelId: process.env.MOD_LOG_CHANNEL_ID || "",
  deleteFlaggedMessages: booleanFromEnv("DELETE_FLAGGED_MESSAGES", false),
  replyToFlaggedMessages: booleanFromEnv("REPLY_TO_FLAGGED_MESSAGES", true),
  enableTestTriggers: booleanFromEnv("ENABLE_TEST_TRIGGERS", false),
  nsfwThreshold: numberFromEnv("NSFW_THRESHOLD", 0.75),
  enableLocalNsfw: booleanFromEnv("ENABLE_LOCAL_NSFW", true),
  localNsfwModel:
    process.env.LOCAL_NSFW_MODEL || "onnx-community/nsfw_image_detection-ONNX",
  localNsfwCacheDir: process.env.LOCAL_NSFW_CACHE_DIR || ".cache/transformers",
  localNsfwAllowRemoteModels: booleanFromEnv("LOCAL_NSFW_ALLOW_REMOTE_MODELS", true),
  scamThreshold: numberFromEnv("SCAM_THRESHOLD", 55),
  badWritingThreshold: numberFromEnv("BAD_WRITING_THRESHOLD", 65),
  badSpeechThreshold: numberFromEnv("BAD_SPEECH_THRESHOLD", 65),
  customBadSpeechTerms: listFromEnv("CUSTOM_BAD_SPEECH_TERMS"),
  deleteBadSpeechMessages: booleanFromEnv("DELETE_BAD_SPEECH_MESSAGES", false),
  enableAiReplies: booleanFromEnv("ENABLE_AI_REPLIES", true),
  geminiApiKey: process.env.GEMINI_API || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  ollamaUrl: process.env.OLLAMA_URL || "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5-coder:0.5b",
  aiReplyTimeoutMs: numberFromEnv("AI_REPLY_TIMEOUT_MS", 12000),
  aiReplyMaxChars: numberFromEnv("AI_REPLY_MAX_CHARS", 900),
  enableLinkScanning: booleanFromEnv("ENABLE_LINK_SCANNING", true),
  vtApiKey: process.env.VT_API_KEY || "",
  vtMaliciousThreshold: numberFromEnv("VT_MALICIOUS_THRESHOLD", 1),
  vtSuspiciousThreshold: numberFromEnv("VT_SUSPICIOUS_THRESHOLD", 2),
  vtSubmitUnknownUrls: booleanFromEnv("VT_SUBMIT_UNKNOWN_URLS", false),
  vtAnalysisWaitMs: numberFromEnv("VT_ANALYSIS_WAIT_MS", 2000),
  linkScanTimeoutMs: numberFromEnv("LINK_SCAN_TIMEOUT_MS", 10000),
  linkScanMaxUrls: numberFromEnv("LINK_SCAN_MAX_URLS", 3),
  deleteBadLinkMessages: booleanFromEnv("DELETE_BAD_LINK_MESSAGES", true)
};

module.exports = { config };
