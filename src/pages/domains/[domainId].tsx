import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  CogIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline"
import { formatDistanceToNow } from "date-fns"
import Head from "next/head"
import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import { downloadFile, getStorageUrl, viewFile } from "~/lib/supabase/storage"
import { formatMinutesToHuman } from "~/lib/utils/time"

interface DomainDetail {
  id: string
  domain: string
  is_active: boolean
  check_interval_minutes: number
  openrouter_model: string
  prompt_profile: { name: string } | null
  _count: {
    pages: number
    jobs: number
  }
  pages: Array<{
    id: string
    url: string
    created_at: string
    page_versions: Array<{
      id: string
      created_at: string
      raw_md_blob_url: string | null
      html_md_blob_url: string | null
    }>
  }>
}

interface Artifacts {
  llmsTxt: { blob_url: string } | null
  llmsFullTxt: { blob_url: string } | null
}

export default function DomainDetailPage() {
  const router = useRouter()
  const { domainId } = router.query as { domainId: string }
  const [domain, setDomain] = useState<DomainDetail | null>(null)
  const [artifacts, setArtifacts] = useState<Artifacts | null>(null)
  const [loading, setLoading] = useState(true)
  const [crawling, setCrawling] = useState(false)

  useEffect(() => {
    if (domainId) {
      fetchDomain()
      fetchArtifacts()
    }
  }, [domainId])

  const fetchDomain = async () => {
    try {
      const response = await fetch(`/api/domains/${domainId}`)
      if (response.ok) {
        const data = await response.json()
        setDomain(data)
      } else if (response.status === 404) {
        router.push("/")
      }
    } catch (error) {
      console.error("Failed to fetch domain:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchArtifacts = async () => {
    try {
      const response = await fetch(`/api/domains/${domainId}/artifacts`)
      if (response.ok) {
        const data = await response.json()
        setArtifacts(data)
      }
    } catch (error) {
      console.error("Failed to fetch artifacts:", error)
    }
  }

  const triggerCrawl = async () => {
    if (!domain) return
    setCrawling(true)

    try {
      const response = await fetch("/api/domains/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.domain,
          checkIntervalMinutes: domain.check_interval_minutes,
          openrouterModel: domain.openrouter_model,
        }),
      })

      if (response.ok) {
        // Refresh domain data
        setTimeout(fetchDomain, 1000)
      } else {
        const error = await response.json()
        console.error("Failed to trigger crawl:", error)
        alert(`Failed to trigger crawl: ${error.error}`)
      }
    } catch (error) {
      console.error("Failed to trigger crawl:", error)
      alert("Failed to trigger crawl")
    } finally {
      setCrawling(false)
    }
  }

  const handleDownload = async (blobUrl: string, filename: string) => {
    try {
      await downloadFile(blobUrl, filename)
    } catch (error) {
      alert("Failed to download file. Please try again.")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-blue-600 border-b-2" />
      </div>
    )
  }

  if (!domain) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Domain not found</p>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>{domain.domain} - llms.txt Generator</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="border-gray-200 border-b bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link
                  href="/"
                  className="text-gray-600 transition-colors hover:text-gray-900"
                >
                  <ChevronLeftIcon className="h-6 w-6" />
                </Link>
                <h1 className="font-bold text-2xl text-gray-900">
                  {domain.domain}
                </h1>
                <span
                  className={`inline-flex rounded-full px-2 font-semibold text-xs leading-5 ${
                    domain.is_active
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {domain.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center space-x-3">
                {artifacts?.llmsTxt && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        viewFile(
                          getStorageUrl(artifacts.llmsTxt?.blob_url ?? ""),
                        )
                      }
                      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 text-sm shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <DocumentTextIcon className="mr-1 h-4 w-4" />
                      View llms.txt
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownload(
                          getStorageUrl(artifacts.llmsTxt?.blob_url ?? ""),
                          `${domain.domain}-llms.txt`,
                        )
                      }
                      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 text-sm shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <ArrowDownTrayIcon className="mr-1 h-4 w-4" />
                      Download llms.txt
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={triggerCrawl}
                  disabled={crawling}
                  className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-3 py-2 font-medium text-sm text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400"
                >
                  <ArrowPathIcon
                    className={`mr-1 h-4 w-4 ${crawling ? "animate-spin" : ""}`}
                  />
                  {crawling ? "Crawling..." : "Trigger Crawl"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 text-sm shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <CogIcon className="mr-1 h-4 w-4" />
                  Settings
                </button>
              </div>
            </div>

            {/* Domain Info */}
            <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
              <div>
                <span className="text-gray-500">Check Interval:</span>{" "}
                <span className="font-medium">
                  {formatMinutesToHuman(domain.check_interval_minutes)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Model:</span>{" "}
                <span className="font-medium">
                  {domain.openrouter_model.replace("openai/", "")}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Total Pages:</span>{" "}
                <span className="font-medium">{domain._count.pages}</span>
              </div>
              <div>
                <span className="text-gray-500">Total Jobs:</span>{" "}
                <span className="font-medium">{domain._count.jobs}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Pages Table */}
        <main className="container mx-auto px-4 py-8">
          <div className="rounded-lg bg-white shadow-sm">
            <div className="border-gray-200 border-b px-6 py-4">
              <h2 className="font-semibold text-gray-900 text-lg">Pages</h2>
            </div>

            {domain.pages.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No pages crawled yet. Trigger a crawl to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                        URL
                      </th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                        Last Version
                      </th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                        Versions
                      </th>
                      <th className="px-6 py-3 text-center font-medium text-gray-500 text-xs uppercase tracking-wider">
                        Raw
                      </th>
                      <th className="px-6 py-3 text-center font-medium text-gray-500 text-xs uppercase tracking-wider">
                        Summarized
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {domain.pages.map((page) => {
                      const latestVersion = page.page_versions[0]
                      return (
                        <tr key={page.id}>
                          <td className="max-w-md truncate px-6 py-4">
                            <a
                              href={page.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 text-sm hover:text-blue-900"
                              title={page.url}
                            >
                              {page.url}
                            </a>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-gray-500 text-sm">
                            {latestVersion
                              ? formatDistanceToNow(
                                  new Date(latestVersion.created_at),
                                  {
                                    addSuffix: true,
                                  },
                                )
                              : "No versions"}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-gray-900 text-sm">
                            {page.page_versions.length}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-center">
                            {latestVersion?.raw_md_blob_url ? (
                              <button
                                type="button"
                                onClick={() =>
                                  viewFile(
                                    getStorageUrl(
                                      latestVersion.raw_md_blob_url ?? "",
                                    ),
                                  )
                                }
                                className="text-blue-600 hover:text-blue-900"
                                title="View raw markdown"
                              >
                                <DocumentTextIcon className="h-5 w-5" />
                              </button>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-center">
                            {latestVersion?.html_md_blob_url ? (
                              <button
                                type="button"
                                onClick={() =>
                                  viewFile(
                                    getStorageUrl(
                                      latestVersion.html_md_blob_url ?? "",
                                    ),
                                  )
                                }
                                className="text-green-600 hover:text-green-900"
                                title="View summarized markdown"
                              >
                                <DocumentTextIcon className="h-5 w-5" />
                              </button>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
