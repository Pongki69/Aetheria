# Email OTP setup

Aetheria already has email OTP endpoints for signup, invited accounts, and password recovery. Delivery uses the Resend email API. No SDK or provider package is needed; the backend calls Resend from the server so the API key never goes to the browser.

## Configure Resend

1. Create a Resend account and add/verify a sender domain in its dashboard.
2. Create a Resend API key with email sending permission.
3. Copy `backend/.env.example` to `backend/.env`.
4. Set `RESEND_API_KEY`, `EMAIL_FROM` to an address on the verified domain, and `OTP_PEPPER` to a unique random secret of at least 32 characters. Keep `.env` private and do not commit it.
5. Set `FRONTEND_ORIGIN` to the frontend URL. Start the backend with `npm run dev` from `backend/`.

Example strong pepper generation in PowerShell:

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Use the generated value as `OTP_PEPPER`. The server refuses to issue codes with the example/default pepper. If no real Resend key and verified sender are configured, no messages can be delivered.

## Endpoints

All endpoints accept JSON and use six-digit codes that expire after 10 minutes. Requests are limited to one code per email address per minute; code verification allows up to five attempts.

| Method | Endpoint | Body | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register/request-code` | `{ "name", "email", "password" }` | Send signup verification code |
| `POST` | `/api/auth/register/verify-code` | `{ "email", "code", "password" }` | Verify signup and create account |
| `POST` | `/api/auth/invite/request-code` | `{ "email" }` | Re-send pending invite verification code |
| `POST` | `/api/auth/forgot-password` | `{ "email" }` | Send password reset code when account exists |
| `POST` | `/api/auth/reset-password` | `{ "email", "code", "password" }` | Verify reset code and change password |

The server stores only an HMAC hash of each OTP in memory, using `OTP_PEPPER`; codes are not written to logs. Pending codes and email rate limits reset when the backend restarts. For production with multiple instances, move OTP state and rate limits to a shared database/cache and add IP-based abuse controls.

## Local verification

With the backend running on port 5000, request a code:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/register/request-code -ContentType 'application/json' -Body '{"name":"Test User","email":"you@example.com","password":"A-long-test-password"}'
```

Do not use real accounts or passwords in shell history. Complete a full delivery check only with an address you control.
