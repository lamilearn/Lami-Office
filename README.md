# Lami AI Office

Unified workspace & monorepo containing services for **AI Office** and **Lami Office**.

## Structure

```
.
├── docker-compose.yml
├── services/
│   ├── ai-office/           # Web app running on port 8088 (office.fatihrumi.id)
│   └── lami-office-react/   # Interactive office running on port 8090 (lami.fatihrumi.id)
```

## Branching Strategy

- **`master`**: Production release and stable branch.
- **`dev`**: Active development branch. All feature work and experiments happen here before being merged to `master`.

## Getting Started

To run all services with Docker Compose:

```bash
docker compose up -d --build
```
