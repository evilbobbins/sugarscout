# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend & Serve
FROM python:3.10-slim
WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Backend code
COPY backend/ ./

# Copy built frontend to FastAPI static directory
COPY --from=frontend-build /app/frontend/dist ./static

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port and run
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]