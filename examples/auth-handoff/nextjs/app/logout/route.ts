import { feedbaxLogoutUrl } from '../../lib/feedbax-handoff'
import { destroyHostSession } from '../../lib/host-auth'

export async function POST() {
  await destroyHostSession()
  const action = feedbaxLogoutUrl('/')
  const escaped = action.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return new Response(
    `<!doctype html><form id="logout" method="post" action="${escaped}"></form>` +
      '<script>document.getElementById("logout").submit()</script>',
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'none'; script-src 'unsafe-inline'; form-action 'self' https:",
        'referrer-policy': 'no-referrer',
      },
    },
  )
}
