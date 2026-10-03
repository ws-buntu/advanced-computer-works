# Advanced Computer Works

## Local site and backend

The site runs as static pages served by the local Express backend. Node.js 22.13 or newer is required.

```powershell
npm install
npm start
```

Open `http://localhost:3000` for the site and `http://localhost:3000/admin` for private administration. The SQLite database is created at `data/acw.sqlite` on first start. It is excluded from Git.

Create or reset the private administrator password in a separate terminal:

```powershell
npm run admin:password
```

The command asks for the administrator email and a password of at least 12 characters. Password input is masked. There is no public registration route.

For local development, the backend generates a temporary session secret at startup. To persist sessions across restarts, copy `.env.example` to `.env` and set `SESSION_SECRET` to a long random value. Production deployment requires a configured session secret and HTTPS.

## Features

- Consultation and estimator quote requests are validated, rate-limited, and stored in SQLite.
- The private admin dashboard at `/admin` lists requests and updates their status.
- Administrators can create, edit, publish, unpublish, and delete blog posts.
- Public blog content is loaded from the API. Existing static cards remain as a fallback when pages are opened directly from disk.
- The backend stores requests but does not send email notifications.

Run the API integration tests with:

```powershell
npm test
```
