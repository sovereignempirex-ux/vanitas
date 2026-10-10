# Vanitas AI Service — Python runtime for the AI/ML domain.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AI_SERVICE_HOST=0.0.0.0 \
    AI_SERVICE_PORT=8100

WORKDIR /srv

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY tests ./tests

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8100/health', timeout=4).status == 200 else 1)"

CMD ["sh", "-c", "uvicorn app.main:app --host ${AI_SERVICE_HOST} --port ${AI_SERVICE_PORT}"]
