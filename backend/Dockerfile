FROM python:3.12-slim

WORKDIR /app

# yt-dlp needs a JavaScript runtime (Deno) for full YouTube support
COPY --from=denoland/deno:bin-2.9.7 /deno /usr/local/bin/deno

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
