FROM python:3.12-slim

WORKDIR /app

# Build deps for source-built wheels (jq needs autotools; cryptography/cffi need gcc+libffi).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential autoconf automake libtool libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Shell form on purpose: expands Railway's $PORT and keeps cwd /app so the relative
# service_account.json path resolves.
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
