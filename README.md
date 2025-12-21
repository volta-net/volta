# Volta

A better GitHub inbox for busy maintainers.

## Setup

Make sure to install the dependencies:

```bash
pnpm install
```

### Create a GitHub App

1. Go to **GitHub Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**
2. Fill in the required fields:

| Field | Value |
| --- | --- |
| **GitHub App name** | Your app name (e.g., `Volta`) |
| **Homepage URL** | `http://localhost:3000` |
| **Callback URL** | `http://localhost:3000/auth/github` |
| **Webhook URL** | Your smee.io URL (see [Webhook Testing](#webhook-testing)) |
| **Webhook secret** | Run `openssl rand -hex 32` to generate one |

3. Set the required **permissions**:

| Permission | Access |
| --- | --- |
| **Repository permissions** | |
| Actions | Read-only |
| Administration | Read-only |
| Checks | Read-only |
| Contents | Read-only |
| Issues | Read & write |
| Metadata | Read-only |
| Pull requests | Read & write |
| **Organization permissions** | |
| Issue Types | Read-only |

4. Subscribe to **events**:
   - Check run
   - Installation target
   - Issue comment
   - Issues
   - Label
   - Member
   - Meta
   - Milestone
   - Public
   - Pull request
   - Pull request review
   - Pull request review comment
   - Pull request review thread
   - Release
   - Repository
   - Status
   - Workflow run

5. For **"Where can this GitHub App be installed?"**, select **Any account** (or **Only on this account** for development)

6. Click **Create GitHub App**

7. After creation:
   - Copy the **App ID** and **Client ID**
   - Generate a **Client Secret** and copy it
   - Generate a **Private Key** (downloads a `.pem` file)

### Environment Variables

Copy `.env.example` to `.env` and fill in the values from your GitHub App:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `NUXT_SESSION_PASSWORD` | A random string of at least 32 characters for session encryption |
| `NUXT_OAUTH_GITHUB_CLIENT_ID` | GitHub App → Client ID |
| `NUXT_OAUTH_GITHUB_CLIENT_SECRET` | GitHub App → Client secrets → Generate |
| `NUXT_GITHUB_APP_ID` | GitHub App → App ID |
| `NUXT_GITHUB_PRIVATE_KEY` | GitHub App → Private keys → Generate (convert newlines to `\n`) |
| `NUXT_GITHUB_WEBHOOK_SECRET` | The webhook secret you set when creating the app |

> **Tip:** To convert the private key, run: `awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' your-app.pem`

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

### Webhook Testing

GitHub App webhooks require a publicly accessible URL. Use [smee.io](https://smee.io) to forward webhooks to your local environment:

1. Go to https://smee.io and click **Start a new channel**
2. Copy the webhook proxy URL (e.g., `https://smee.io/abc123`)
3. Install the smee client:

```bash
pnpm add -g smee-client
```

4. Start the smee client to forward webhooks:

```bash
smee -u https://smee.io/YOUR_CHANNEL_ID -t http://localhost:3000/webhook
```

5. In your GitHub App settings, set the **Webhook URL** to your smee.io URL

> **Note:** GitHub CLI webhook forwarding (`gh webhook forward`) only works with repository and organization webhooks, not GitHub App webhooks.

## Production

Build the application for production:

```bash
pnpm build
```

Locally preview production build:

```bash
pnpm preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
