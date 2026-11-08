# CA-43: TLS, secrets and deployment security

The directly hosted production server requires TLS. Set `NODE_ENV=production`, `TLS_CERT_PATH` to the certificate chain, `TLS_KEY_PATH` to its private key, `JWT_SECRET` to a random secret of at least 32 characters, and `ALLOWED_ORIGIN` to the exact `https://` origin used by the browser (no path or trailing slash). The Node server serves HTTPS and WSS on the same port with TLS 1.2 as the minimum; startup fails if required production settings are missing or invalid. Use a CA-issued certificate valid for the deployment hostname. Configure `MONGO_URI` to the deployment's database, with transport protection appropriate to that database.

Plain HTTP/WS remains available for local development when `NODE_ENV` is not `production` and no TLS files are set; it is **not** suitable for a public deployment. This direct-TLS configuration does not implement an HTTP-to-HTTPS redirect or an external TLS-terminating reverse proxy. If a proxy is required, design and test its network isolation and TLS settings separately rather than bypassing the production guard. Do not expose a separate plaintext port publicly.

Keep certificates, private keys, JWT and database secrets outside Git and distribute them through the host's secret manager/environment. `.env` is gitignored; `.env.example` contains placeholders only. Limit file access, rotate leaked secrets immediately, use unique secrets per environment, and do not share secrets in chat or issue comments. The 32-character check is a minimum length check, not a substitute for random generation.

## Verification before sign-off

- Start with real certificates on the target hostname and confirm `https://` and `wss://` work, the certificate verifies, the expected Origin is accepted, and unapproved origins are rejected.
- Use `openssl s_client -connect HOST:PORT -servername HOST -tls1_2` and a TLS 1.3 check; confirm TLS 1.1 and plaintext HTTP/WS fail. Run only against the team's authorized deployment. No hosted target or real certificate was provided for this change, so these deployment checks remain **not run**.
- Run `npm audit` and review all findings, fix availability, transitive dependency use and any remaining risk. Never use `npm audit fix --force` without reviewing breaking dependency changes.

## Local audit and transport evidence

On the Sprint 3 branch, `npm audit` was run against the lockfile. The original result was 27 advisories (3 low, 21 moderate, 2 high, 1 critical). Compatible lockfile updates and a tested bcrypt 5-to-6 upgrade removed the high and critical findings. The resulting audit reports 23 findings (3 low, 20 moderate, 0 high, 0 critical), all in the development dependency tree; `npm audit --omit=dev` reports zero findings. Audit counts can change as advisories are published. The remaining advisories include `deepmerge`, `glob` and `minimatch` through Jest, ESLint and Nodemon; the audit's proposed major/downgrade changes were not applied without compatibility review. Re-run and triage before release.

A local disposable MongoDB and a temporary self-signed certificate were used to test the direct server: HTTPS `/health` returned connected, TLS 1.2 succeeded, TLS 1.1 was rejected, and an authenticated WSS connection succeeded. These are local tests, not evidence of a publicly hosted or CA-trusted deployment.
