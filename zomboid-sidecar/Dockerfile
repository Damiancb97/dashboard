FROM python:3.11-slim

# Unbuffered stdout, or the idle-shutdown notices sit in Python's buffer and never
# reach `docker logs` (the access log lands there only because it goes to stderr).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y procps bash && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py .

EXPOSE 61212

CMD ["python", "server.py"]
