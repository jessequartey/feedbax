import { safeReturnPath } from '@feedbax/auth-handoff'
import { createFileRoute } from '@tanstack/react-router'
import { createEmailSession } from '../auth.server.js'

const page = (returnPath: string, error = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Continue to Feedbax</title><style>
body{font:16px/1.5 system-ui;margin:0;background:#f6f7fb;color:#25273d}main{max-width:28rem;margin:12vh auto;padding:2rem;background:#fff;border:1px solid #d4d7e1;border-radius:1rem}label{display:block;font-weight:650;margin-bottom:.5rem}input,button{box-sizing:border-box;width:100%;padding:.75rem;border-radius:.5rem;font:inherit}input{border:1px solid #9aa1b2}button{margin-top:1rem;border:0;background:#2563eb;color:#fff;font-weight:700}p{color:#626a80}.error{color:#b42318}</style></head>
<body><main><h1>Continue with email</h1><p>Enter an email so the Feedbax team can follow up. Ownership is not verified.</p>
${error ? `<p class="error" role="alert">${error}</p>` : ''}
<form method="post"><input type="hidden" name="return_path" value="${returnPath}"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required><button type="submit">Continue</button></form></main></body></html>`

export const Route = createFileRoute('/auth/email')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const returnPath = safeReturnPath(
          new URL(request.url).searchParams.get('return_path'),
        )
        return new Response(page(returnPath), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      },
      POST: async ({ request }) => {
        const origin = request.headers.get('origin')
        if (origin && origin !== new URL(request.url).origin)
          return new Response('Origin rejected.', { status: 403 })
        const form = await request.formData()
        const email = String(form.get('email') ?? '')
        const returnPath = safeReturnPath(
          String(form.get('return_path') ?? '/'),
        )
        try {
          const session = await createEmailSession(email, returnPath)
          return new Response(null, {
            status: 303,
            headers: {
              location: session.returnPath,
              'set-cookie': session.cookie,
              'cache-control': 'private, no-store',
            },
          })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Email could not be saved.'
          return new Response(page(returnPath, message), {
            status: 422,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        }
      },
    },
  },
})
