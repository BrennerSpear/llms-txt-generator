import Head from "next/head"
import Link from "next/link"
import { DomainCrawler } from "~/components/DomainCrawler"

export default function Home() {
  return (
    <>
      <Head>
        <title>llms.txt Generator</title>
        <meta name="description" content="llms.txt Generator" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <h1 className="mb-8 text-center font-bold text-4xl">
            llms.txt Generator
          </h1>
          <div className="flex justify-center">
            <DomainCrawler />
          </div>
        </div>
      </main>
    </>
  )
}
