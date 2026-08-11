FROM python:3.11-slim

RUN apt-get update && apt-get install -y procps bash && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py .

EXPOSE 61212

CMD ["python", "server.py"]
