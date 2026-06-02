import type { AppProps } from 'next/app'
import Head from 'next/head'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>AMARIS</title>
        <meta name="description" content="AI-driven Monitoring, Action, Retention, and Intelligent Smart Engagement" />
        <link rel="icon" href="/LogoAmaris.png" />
        <link rel="apple-touch-icon" href="/LogoAmaris.png" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
