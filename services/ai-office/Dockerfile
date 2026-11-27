FROM python:3.11-slim
RUN pip install --no-cache-dir docker==7.1.0 && rm -rf /root/.cache
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py sketch.html .
EXPOSE 80
CMD ["python", "server.py"]
