# Vanitas Analytics Service — data-analysis domain (Python)
FROM python:3.12-slim

# R is optional: installing it costs ~200MB, so it is opt-in via build arg.
# Without it the service serves the identical numbers from the Python engine.
ARG WITH_R=0
RUN if [ "$WITH_R" = "1" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends r-base \
      && rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /srv/analytics

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY stats ./stats

ENV ANALYTICS_SERVICE_HOST=0.0.0.0 \
    ANALYTICS_SERVICE_PORT=8200 \
    PYTHONUNBUFFERED=1

EXPOSE 8200

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8200/health', timeout=3).status == 200 else 1)"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]
