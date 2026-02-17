## Getting Started

```bash
npm install
npm run dev
```

## Database

This template uses Neon (Postgres) for the database.

**After editing `src/db/schema.ts`, push your changes:**
```bash
npm run db:push
```

This command generates migration files and applies them to the database.

**Or run steps separately:**
```bash
# Generate migration files
npm run db:generate

# Apply migrations
npm run db:migrate
```

## Customization

- Add your API endpoints in `src/index.ts`
- Define your database schema in `src/db/schema.ts`
- Generate and apply migrations as needed
