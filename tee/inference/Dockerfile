FROM python:3.11-slim

RUN pip install uv
WORKDIR /app
ENV PYTHONPATH=/app/src

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

COPY src ./src
COPY tests ./tests

CMD ["uv", "run", "uvicorn", "main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080"]
