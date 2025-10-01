import Head from "next/head"
import Link from "next/link"
import { useCallback, useState } from "react"
import { DomainCrawler } from "~/components/DomainCrawler"
import { RecrawlModal } from "~/components/RecrawlModal"
import { DomainsTable } from "~/components/domains-table"

export default function Home() {
  const [refreshDomains, setRefreshDomains] = useState<(() => void) | null>(
    null,
  )
  const [showRecrawlModal, setShowRecrawlModal] = useState(false)

  const handleRefreshNeeded = useCallback((refreshFn: () => void) => {
    setRefreshDomains(() => refreshFn)
  }, [])

  const handleDomainAdded = () => {
    if (refreshDomains) {
      refreshDomains()
    }
  }

  const handleRecrawlComplete = () => {
    if (refreshDomains) {
      refreshDomains()
    }
  }

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
            <DomainCrawler onDomainAdded={handleDomainAdded} />
          </div>
        </div>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <div className="rounded-lg bg-white shadow-sm">
            <div className="flex items-center justify-between border-gray-200 border-b px-6 py-4">
              <h2 className="font-semibold text-gray-900 text-lg">
                Crawled Domains
              </h2>
              <button
                type="button"
                onClick={() => setShowRecrawlModal(true)}
                className="rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Check Recrawls
              </button>
            </div>
            <DomainsTable onRefreshNeeded={handleRefreshNeeded} />
          </div>
        </main>

        {showRecrawlModal && (
          <RecrawlModal
            onClose={() => setShowRecrawlModal(false)}
            onComplete={handleRecrawlComplete}
          />
        )}
      </div>
    </>
  )
}
