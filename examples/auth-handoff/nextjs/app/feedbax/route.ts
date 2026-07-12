import { redirect } from 'next/navigation'
import { acceptedReturnTo, handoffDestination } from '../../lib/feedbax-handoff'
import { getHostUser } from '../../lib/host-auth'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const returnTo = acceptedReturnTo(requestUrl.searchParams.get('return_to'))
  const user = await getHostUser()

  if (!user) {
    const callback = new URL('/feedbax', requestUrl.origin)
    callback.searchParams.set('return_to', returnTo.toString())
    const login = new URL('/login', requestUrl.origin)
    login.searchParams.set('return_to', callback.toString())
    redirect(login.toString())
  }

  redirect(await handoffDestination(user, returnTo))
}
