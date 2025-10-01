"use client"

import { XMarkIcon } from "@heroicons/react/24/outline"
import { formatDistanceToNow } from "date-fns"
import { useEffect, useRef, useState } from "react"

interface DomainRecrawl {
  id: string
  domain: string
  checkIntervalMinutes: number
  lastCrawledAt: string | null
  minutesSinceLastCrawl: number | null
}

interface RecrawlData {
  domains: DomainRecrawl[]
  total: number
  skippedDueToOngoingJobs: number
}

interface RecrawlModalProps {
  onClose: () => void
  onComplete: () => void
}

export function RecrawlModal({ onClose, onComplete }: RecrawlModalProps) {
  const [loading, setLoading] = useState(true)
  const [recrawlData, setRecrawlData] = useState<RecrawlData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const hasFetched = useRef(false)

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchRecrawlData()
    }
  }, [])

  const fetchRecrawlData = async () => {
    try {
      const response = await fetch("/api/schedule/check-recrawls")
      if (!response.ok) {
        throw new Error("Failed to fetch recrawl data")
      }
      const data = await response.json()
      setRecrawlData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const response = await fetch("/api/schedule/recrawls", {
        method: "POST",
      })
      if (!response.ok) {
        throw new Error("Failed to trigger recrawls")
      }
      onComplete()
      onClose()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to trigger recrawls",
      )
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-gray-200 border-b px-6 py-4">
          <h2 className="font-semibold text-gray-900 text-lg">
            Domains Ready for Recrawl
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-blue-600 border-b-2" />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-600 text-sm">
              {error}
            </div>
          )}

          {!loading &&
            !error &&
            recrawlData &&
            (recrawlData.total === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No domains are due for recrawl at this time.
              </div>
            ) : (
              <>
                <p className="mb-4 text-gray-600 text-sm">
                  {recrawlData.total} domain
                  {recrawlData.total !== 1 ? "s" : ""} ready for recrawl
                  {recrawlData.skippedDueToOngoingJobs > 0 && (
                    <span className="text-gray-500">
                      {" "}
                      ({recrawlData.skippedDueToOngoingJobs} skipped due to
                      ongoing jobs)
                    </span>
                  )}
                </p>
                <div className="space-y-3">
                  {recrawlData.domains.map((domain) => (
                    <div
                      key={domain.id}
                      className="rounded-md border border-gray-200 bg-gray-50 p-3"
                    >
                      <div className="font-medium text-gray-900 text-sm">
                        {domain.domain}
                      </div>
                      <div className="mt-1 text-gray-500 text-xs">
                        Last crawled:{" "}
                        {domain.lastCrawledAt
                          ? formatDistanceToNow(
                              new Date(domain.lastCrawledAt),
                              {
                                addSuffix: true,
                              },
                            )
                          : "Never"}
                      </div>
                      <div className="text-gray-500 text-xs">
                        Interval: {domain.checkIntervalMinutes} minutes
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-gray-200 border-t bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {recrawlData && recrawlData.total > 0 && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {confirming ? "Confirming..." : "Confirm Recrawl"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
