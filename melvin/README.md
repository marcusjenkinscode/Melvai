# Melvin AI — Model Setup

Melvin is a custom Ollama model designed for the Melvai.com terminal interface.
It can run on multiple base models. Use the Modelfile that matches what you have
available on your VPS.

## Quick start

### 1. Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Pull a base model

| Modelfile           | Base model         | Pull command                    |
|---------------------|--------------------|---------------------------------|
| `Modelfile`         | Llama 3.2 (3B)     | `ollama pull llama3.2`          |
| `Modelfile.qwen`    | Qwen 2.5 (7B)      | `ollama pull qwen2.5`           |
| `Modelfile.gemma`   | Gemma 3 (4B)       | `ollama pull gemma3`            |
| `Modelfile.deepseek`| DeepSeek-R1 (7B)   | `ollama pull deepseek-r1`       |

For Kimi cloud models, set `KIMI_API_KEY` in `server/.env` (no pull needed).

### 3. Create the Melvin model

```bash
# Default (Llama 3.2)
ollama create melvin -f melvin/Modelfile

# Or choose another base:
ollama create melvin-qwen     -f melvin/Modelfile.qwen
ollama create melvin-gemma    -f melvin/Modelfile.gemma
ollama create melvin-deepseek -f melvin/Modelfile.deepseek
```

### 4. Verify

```bash
ollama list           # should show melvin (and variants)
ollama run melvin "Hello, who are you?"
```

### 5. Start the API server

```bash
cd server
cp .env.example .env  # edit if Ollama runs on a non-default port
npm install
npm start
```

### 6. Start the web app (dev)

```bash
cd web
npm install
npm run dev:full   # starts both the API server and Vite dev server
```

Open http://localhost:5173 in your browser.

## Kimi (Moonshot AI) cloud model

Kimi is available as a cloud model via the Moonshot AI API. To enable it:

1. Sign up at https://platform.moonshot.cn/
2. Create an API key
3. Set it in `server/.env`:
   ```
   KIMI_API_KEY=sk-...
   ```
4. Restart the API server. Kimi models will appear in `/models`.

## Customising the system prompt

Edit the `SYSTEM` block in the appropriate Modelfile, then recreate the model:

```bash
ollama create melvin -f melvin/Modelfile
```

Or use the `/system` command in the Melvai terminal to set a session-level prompt.
