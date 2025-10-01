import Head from "next/head"
import Link from "next/link"
import { DomainCrawler } from "~/components/DomainCrawler"
import { DomainsTable } from "~/components/domains-table"

export default function Home() {
  // Main page with header and domains table
  return (
    <>
      <Head>
        <title>llms.txt Generator</title>
        <meta name="description" content="llms.txt Generator" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="min-h-screen bg-gray-50">
        {/* Header Bar */}
        <header className="border-gray-200 border-b bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <h1 className="font-bold text-2xl text-gray-900">
              llms.txt Generator
            </h1>
          </div>
        </header>

        {/* Sticky Form Section */}
        <div className="sticky top-0 z-10 border-gray-200 border-b bg-white shadow-md">
          <div className="container mx-auto px-4 py-6">
            <DomainCrawler />
          </div>
        </div>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <div className="rounded-lg bg-white shadow-sm">
            <div className="border-gray-200 border-b px-6 py-4">
              <h2 className="font-semibold text-gray-900 text-lg">
                Crawled Domains
              </h2>
            </div>
            <DomainsTable />
          </div>
        </main>
      </div>
    </>
  )
}
