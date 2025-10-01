"use client"

import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  PencilIcon,
} from "@heroicons/react/24/outline"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { useEffect, useState } from "react"

interface Domain {
  id: string
  domain: string
  is_active: boolean
  check_interval_minutes: number
  openrouter_model: string
  prompt_profile: { name: string } | null
  _count: { pages: number }
  lastJob: {
    started_at: string
    finished_at: string | null
    status: "processing" | "finished" | "failed" | "canceled"
    _count: { page_versions: number }
  } | null
  created_at: string
  updated_at: string
}

interface Artifacts {
  llmsTxt: { blob_url: string } | null
  llmsFullTxt: { blob_url: string } | null
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

export function DomainsTable() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [artifacts, setArtifacts] = useState<Record<string, Artifacts>>({})
  const [loadingArtifacts, setLoadingArtifacts] = useState<Set<string>>(
    new Set(),
  )
  const [crawlingDomains, setCrawlingDomains] = useState<Set<string>>(new Set())

  // Helper to construct full Supabase storage URL from path
  const getStorageUrl = (path: string) => {
    return `${SUPABASE_URL}/storage/v1/object/public/artifacts/${path}`
  }

  useEffect(() => {
    fetchDomains()
    const interval = setInterval(fetchDomains, 10000) // Poll every 10 seconds
    return () => clearInterval(interval)
  }, [])

  const fetchDomains = async () => {
    try {
      const response = await fetch("/api/domains")
      if (response.ok) {
        const data = await response.json()
        setDomains(data)

        // Fetch artifacts for domains that have finished jobs
        for (const domain of data) {
          if (domain.lastJob?.status === "finished" && !artifacts[domain.id]) {
            fetchArtifacts(domain.id)
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch domains:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchArtifacts = async (domainId: string) => {
    if (loadingArtifacts.has(domainId)) return

    setLoadingArtifacts((prev) => new Set(prev).add(domainId))
    try {
      const response = await fetch(`/api/domains/${domainId}/artifacts`)
      if (response.ok) {
        const data = await response.json()
        setArtifacts((prev) => ({ ...prev, [domainId]: data }))
      }
    } catch (error) {
      console.error(`Failed to fetch artifacts for ${domainId}:`, error)
    } finally {
      setLoadingArtifacts((prev) => {
        const next = new Set(prev)
        next.delete(domainId)
        return next
      })
    }
  }

  const triggerCrawl = async (domain: Domain) => {
    setCrawlingDomains((prev) => new Set(prev).add(domain.id))

    try {
      const response = await fetch("/api/domains/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.domain,
          checkIntervalMinutes: domain.check_interval_minutes,
          openrouterModel: domain.openrouter_model,
          promptProfileId: domain.prompt_profile?.name,
        }),
      })

      if (response.ok) {
        // Refresh domains list
        setTimeout(fetchDomains, 1000)
      } else {
        const error = await response.json()
        console.error("Failed to trigger crawl:", error)
        alert(`Failed to trigger crawl: ${error.error}`)
      }
    } catch (error) {
      console.error("Failed to trigger crawl:", error)
      alert("Failed to trigger crawl")
    } finally {
      setCrawlingDomains((prev) => {
        const next = new Set(prev)
        next.delete(domain.id)
        return next
      })
    }
  }

  const downloadArtifact = async (blobUrl: string, filename: string) => {
    try {
      // Fetch the file content from the blob URL
      const response = await fetch(blobUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`)
      }

      // Create a blob from the response
      const blob = await response.blob()

      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob)

      // Create and trigger download link
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to download artifact:", error)
      alert("Failed to download file. Please try again.")
    }
  }

  const viewArtifact = (blobUrl: string) => {
    // Open the Supabase storage URL directly in a new tab
    window.open(blobUrl, "_blank")
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-blue-600 border-b-2" />
      </div>
    )
  }

  if (domains.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        No domains found. Add a domain using the form above to get started.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
              Domain
            </th>
            <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
              Pages
            </th>
            <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
              Last Crawl
            </th>
            <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
              Interval
            </th>
            <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
              Model
            </th>
            <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {domains.map((domain) => (
            <tr key={domain.id}>
              <td className="whitespace-nowrap px-6 py-4">
                <Link
                  href={`/domains/${domain.id}`}
                  className="font-medium text-blue-600 hover:text-blue-900"
                >
                  {domain.domain}
                </Link>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <span
                  className={`inline-flex rounded-full px-2 font-semibold text-xs leading-5 ${
                    domain.is_active
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {domain.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-gray-900 text-sm">
                {domain._count.pages}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-gray-500 text-sm">
                {domain.lastJob ? (
                  <div>
                    <div>
                      {formatDistanceToNow(
                        new Date(domain.lastJob.started_at),
                        { addSuffix: true },
                      )}
                    </div>
                    <div className="text-xs">
                      <span
                        className={`inline-flex rounded px-1 ${
                          domain.lastJob.status === "finished"
                            ? "bg-green-100 text-green-800"
                            : domain.lastJob.status === "processing"
                              ? "bg-blue-100 text-blue-800"
                              : domain.lastJob.status === "failed"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {domain.lastJob.status}
                      </span>
                    </div>
                  </div>
                ) : (
                  "Never"
                )}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-gray-900 text-sm">
                {domain.check_interval_minutes} min
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-gray-900 text-sm">
                {domain.openrouter_model.replace("openai/", "")}
              </td>
              <td className="whitespace-nowrap px-6 py-4 font-medium text-sm">
                <div className="flex items-center space-x-2">
                  {artifacts[domain.id] && (
                    <>
                      {artifacts[domain.id]?.llmsTxt && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              viewArtifact(
                                getStorageUrl(
                                  artifacts[domain.id]?.llmsTxt?.blob_url ?? "",
                                ),
                              )
                            }
                            className="text-blue-600 hover:text-blue-900"
                            title="View llms.txt"
                          >
                            <DocumentTextIcon className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void downloadArtifact(
                                getStorageUrl(
                                  artifacts[domain.id]?.llmsTxt?.blob_url ?? "",
                                ),
                                `${domain.domain}-llms.txt`,
                              )
                            }
                            className="text-blue-600 hover:text-blue-900"
                            title="Download llms.txt"
                          >
                            <ArrowDownTrayIcon className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      {artifacts[domain.id]?.llmsFullTxt && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              viewArtifact(
                                getStorageUrl(
                                  artifacts[domain.id]?.llmsFullTxt?.blob_url ??
                                    "",
                                ),
                              )
                            }
                            className="text-green-600 hover:text-green-900"
                            title="View llms-full.txt"
                          >
                            <DocumentTextIcon className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void downloadArtifact(
                                getStorageUrl(
                                  artifacts[domain.id]?.llmsFullTxt?.blob_url ??
                                    "",
                                ),
                                `${domain.domain}-llms-full.txt`,
                              )
                            }
                            className="text-green-600 hover:text-green-900"
                            title="Download llms-full.txt"
                          >
                            <ArrowDownTrayIcon className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => triggerCrawl(domain)}
                    disabled={crawlingDomains.has(domain.id)}
                    className={`${
                      crawlingDomains.has(domain.id)
                        ? "cursor-not-allowed text-gray-400"
                        : "text-blue-600 hover:text-blue-900"
                    }`}
                    title="Trigger new crawl"
                  >
                    <ArrowPathIcon
                      className={`h-5 w-5 ${
                        crawlingDomains.has(domain.id) ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    className="text-gray-600 hover:text-gray-900"
                    title="Edit settings"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
