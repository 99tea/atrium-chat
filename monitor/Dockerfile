FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
COPY monitor_core.py .
COPY monitor_overview.py .
COPY monitor_agents.py .
COPY monitor_conversations.py .
COPY monitor_today.py .
COPY monitor_me.py .
COPY monitor_clients.py .
COPY monitor_home.py .
COPY monitor_sla.py .
COPY monitor_bugs.py .
COPY monitor_settings.py .
COPY auth.py .
COPY static ./static
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
