"use client"

import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline"
import { formatDistanceToNow } from "date-fns"
import { useCallback, useEffect, useState } from "react"
import { downloadFile, getStorageUrl, viewFile } from "~/lib/supabase/storage"
import { formatMinutesToHuman } from "~/lib/utils/time"

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

interface DomainsTableProps {
  onRefreshNeeded?: (refreshFn: () => void) => void
}

export function DomainsTable({ onRefreshNeeded }: DomainsTableProps = {}) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [artifacts, setArtifacts] = useState<Record<string, Artifacts>>({})
  const [loadingArtifacts, setLoadingArtifacts] = useState<Set<string>>(
    new Set(),
  )

  const fetchDomains = useCallback(async () => {
    try {
      const response = await fetch("/api/domains")
      if (response.ok) {
        const data = await response.json()
        setDomains(data)

        // Fetch artifacts for domains that have finished jobs
        for (const domain of data) {
          if (domain.lastJob?.status === "finished") {
            setArtifacts((prevArtifacts) => {
              // Only fetch if we don't already have artifacts for this domain
              if (!prevArtifacts[domain.id]) {
                fetchArtifacts(domain.id)
              }
              return prevArtifacts
            })
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch domains:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDomains()
    const interval = setInterval(fetchDomains, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [fetchDomains])

  useEffect(() => {
    if (onRefreshNeeded) {
      onRefreshNeeded(fetchDomains)
    }
  }, [onRefreshNeeded, fetchDomains])

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

  const handleDownload = async (blobUrl: string, filename: string) => {
    try {
      await downloadFile(blobUrl, filename)
    } catch (error) {
      alert("Failed to download file. Please try again.")
    }
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
            <th className="px-6 py-3 text-center font-medium text-gray-500 text-xs uppercase tracking-wider">
              llms.txt
            </th>
            <th className="px-6 py-3 text-center font-medium text-gray-500 text-xs uppercase tracking-wider">
              llms-full.txt
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {domains.map((domain) => (
            <tr key={domain.id}>
              <td className="whitespace-nowrap px-6 py-4">
                <a
                  href={`/domains/${domain.id}`}
                  className="font-medium text-blue-600 hover:text-blue-900"
                >
                  {domain.domain}
                </a>
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
                  domain.lastJob.status === "processing" ? (
                    <span className="inline-flex animate-pulse rounded bg-blue-100 px-2 py-1 text-blue-800 text-xs">
                      Processing
                    </span>
                  ) : (
                    <div>
                      <div>
                        {formatDistanceToNow(
                          new Date(domain.lastJob.started_at),
                          { addSuffix: true },
                        )}
                      </div>
                      {domain.lastJob.status !== "finished" && (
                        <div className="text-xs">
                          <span
                            className={`inline-flex rounded px-1 ${
                              domain.lastJob.status === "failed"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {domain.lastJob.status}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  "Never"
                )}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-gray-900 text-sm">
                {formatMinutesToHuman(domain.check_interval_minutes)}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-center">
                {artifacts[domain.id]?.llmsTxt ? (
                  <div className="flex items-center justify-center space-x-2">
                    <button
                      type="button"
                      onClick={() =>
                        viewFile(
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
                        void handleDownload(
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
                  </div>
                ) : (
                  <span className="text-gray-400 text-xs">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-center">
                {artifacts[domain.id]?.llmsFullTxt ? (
                  <div className="flex items-center justify-center space-x-2">
                    <button
                      type="button"
                      onClick={() =>
                        viewFile(
                          getStorageUrl(
                            artifacts[domain.id]?.llmsFullTxt?.blob_url ?? "",
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
                        void handleDownload(
                          getStorageUrl(
                            artifacts[domain.id]?.llmsFullTxt?.blob_url ?? "",
                          ),
                          `${domain.domain}-llms-full.txt`,
                        )
                      }
                      className="text-green-600 hover:text-green-900"
                      title="Download llms-full.txt"
                    >
                      <ArrowDownTrayIcon className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-gray-400 text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
