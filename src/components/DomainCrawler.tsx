import React, { useState } from "react"

interface CrawlConfig {
  checkIntervalMinutes: number
  openrouterModel: string
  maxPages: number
  promptProfileId?: string
}

export function DomainCrawler() {
  const [url, setUrl] = useState("")
  const [config, setConfig] = useState<CrawlConfig>({
    checkIntervalMinutes: 1440,
    openrouterModel: "openai/gpt-4o-mini",
    maxPages: 10,
    promptProfileId: undefined,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ jobId?: string } | null>(null)

  const normalizeDomain = (inputUrl: string): string => {
    let normalized = inputUrl.trim().toLowerCase()
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = `https://${normalized}`
    }
    try {
      const urlObj = new URL(normalized)
      return urlObj.hostname
    } catch {
      return normalized
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!url.trim()) {
      setError("Please enter a URL")
      return
    }

    setIsLoading(true)

    try {
      const normalizedDomain = normalizeDomain(url)

      const response = await fetch("/api/domains/crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          checkIntervalMinutes: config.checkIntervalMinutes,
          openrouterModel: config.openrouterModel,
          maxPages: config.maxPages,
          promptProfileId: config.promptProfileId || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          setError("A crawl job is already active for this domain")
        } else {
          console.error("API error response:", data)
          setError(data.error || data.message || "Failed to initiate crawl")
        }
      } else {
        setSuccess({ jobId: data.jobId })
        setUrl("")
        setConfig({
          checkIntervalMinutes: 1440,
          openrouterModel: "openai/gpt-4o-mini",
          maxPages: 10,
          promptProfileId: undefined,
        })
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-2xl p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">Domain Crawler</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
            URL
          </label>
          <input
            type="text"
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="tryprofound.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            Domain will be automatically normalized
          </p>
        </div>

        <div>
          <label htmlFor="checkInterval" className="block text-sm font-medium text-gray-700 mb-1">
            Check Interval (minutes)
          </label>
          <input
            type="number"
            id="checkInterval"
            value={config.checkIntervalMinutes}
            onChange={(e) => setConfig({ ...config, checkIntervalMinutes: parseInt(e.target.value) || 1440 })}
            min={1}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="openrouterModel" className="block text-sm font-medium text-gray-700 mb-1">
            OpenRouter Model
          </label>
          <input
            type="text"
            id="openrouterModel"
            value={config.openrouterModel}
            onChange={(e) => setConfig({ ...config, openrouterModel: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="maxPages" className="block text-sm font-medium text-gray-700 mb-1">
            Max Pages
          </label>
          <input
            type="number"
            id="maxPages"
            value={config.maxPages}
            onChange={(e) => setConfig({ ...config, maxPages: parseInt(e.target.value) || 10 })}
            min={1}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="promptProfileId" className="block text-sm font-medium text-gray-700 mb-1">
            Prompt Profile ID (optional)
          </label>
          <input
            type="text"
            id="promptProfileId"
            value={config.promptProfileId || ""}
            onChange={(e) => setConfig({ ...config, promptProfileId: e.target.value || undefined })}
            placeholder="Select a prompt profile"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            Leave empty to use default prompt
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">
              Crawl initiated successfully!
              {success.jobId && (
                <>
                  {" "}Job ID:{" "}
                  <a href={`/jobs/${success.jobId}`} className="underline font-medium">
                    {success.jobId}
                  </a>
                </>
              )}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Initiating Crawl..." : "Start Crawl"}
        </button>
      </form>
    </div>
  )
}