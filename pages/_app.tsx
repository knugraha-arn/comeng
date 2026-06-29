import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useTracking } from '@/lib/useTracking'

function TrackingWrapper({ Component, pageProps }: AppProps) {
  useTracking() // Track page_view + duration di setiap halaman
  return <Component {...pageProps} />
}

export default function App(props: AppProps) {
  return (
    <>
      <Head>
        <title>AMARIS</title>
        <meta name="description" content="AI-driven Monitoring, Action, Retention, and Intelligent Smart Engagement" />
        <link rel="icon" href="/LogoAmaris.png" />
        <link rel="apple-touch-icon" href="/LogoAmaris.png" />
      </Head>
      <TrackingWrapper {...props} />
    </>
  )
}
