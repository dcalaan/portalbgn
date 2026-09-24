# BGN Reels Studio

Aplicativo do Portal BGN para preparar Reels dentro do ChatGPT.

## Recursos
- Upload de vídeo vertical
- Escolha de frame da capa
- 6 modelos de capa BGN
- Título, subtítulo e categoria
- Download do vídeo
- Download da capa em 1080x1920
- Legenda editável com botão copiar
- Geração de título, subtítulo e legenda com IA
- Endpoint MCP em `/mcp`

## Variáveis
- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL` (padrão: `gpt-5.6-luna`)
- `OPENAI_TRANSCRIBE_MODEL` (padrão: `gpt-4o-mini-transcribe`)
- `PUBLIC_BASE_URL`
- `PORT`

## Endpoints
- `/`
- `/health`
- `/mcp`
