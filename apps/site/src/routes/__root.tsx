import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import siteCss from '../styles.css?url'
export const Route = createRootRoute({ head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Feedbax' }], links: [{ rel: 'stylesheet', href: siteCss }] }), component: () => <html lang="en"><head><HeadContent /></head><body><Outlet /><Scripts /></body></html> })
