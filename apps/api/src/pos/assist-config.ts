function value(input: string | undefined) {
  const text = input?.trim() ?? '';
  return ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
    ? text.slice(1, -1).trim() : text;
}

export function assistConfig(env: NodeJS.ProcessEnv = process.env) {
  const provider = value(env.AI_PROVIDER).toLowerCase() || (value(env.GROQ_API_KEY) ? 'groq' : '');
  const groq = provider === 'groq';
  const key = groq ? value(env.GROQ_API_KEY) || value(env.AI_PROVIDER_KEY) : value(env.AI_PROVIDER_KEY) || value(env.GROQ_API_KEY);
  const model = value(env.AI_PROVIDER_MODEL) || (groq ? 'qwen/qwen3.8-27b' : '');
  // Explicit Groq selection must never send its key to a stale provider URL.
  const baseUrl = groq ? 'https://api.groq.com/openai/v1' : value(env.AI_PROVIDER_BASE_URL) || 'https://api.openai.com/v1';
  const missing: string[] = [];
  if (!['groq', 'openai-compatible'].includes(provider)) missing.push('AI_PROVIDER must be groq or openai-compatible');
  if (!key) missing.push('AI_PROVIDER_KEY (or GROQ_API_KEY) is missing');
  if (!model) missing.push('AI_PROVIDER_MODEL is missing');
  // Do not accidentally send an alias key to OpenAI when the base URL was omitted.
  if (!groq && !value(env.AI_PROVIDER_KEY) && value(env.GROQ_API_KEY) && !value(env.AI_PROVIDER_BASE_URL)) {
    missing.push('set AI_PROVIDER=groq to use GROQ_API_KEY');
  }
  return { key, model, baseUrl, missing };
}
