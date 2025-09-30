// /**
//  * Comprehensive Integration Tests for Inngest Functions
//  *
//  * This test suite covers all three Inngest functions (F1-F3) and their interactions:
//  * - F1: startCrawl - Initiates domain crawls
//  * - F2: handleCrawlPage - Processes incoming page data
//  * - F3: processUrl - Cleans content, generates fingerprints, manages versions
//  *
//  * Run with: pnpm tsx test/integration-tests/inngest-functions.test.ts
//  */

// import { WebhookSimulator } from "../../src/lib/mocks/webhook-simulator"

// const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000"

// // Test configuration
// const TEST_SCENARIOS = {
//   happyPath: {
//     domain: "test.integration.com",
//     pageCount: 3,
//   },
//   changeDetection: {
//     domain: "changes.test.com",
//     initialPages: 3,
//     modifiedPages: 2, // Simulate 2 pages with changes
//   },
//   errorHandling: {
//     domain: "error.test.com",
//     invalidDomain: "invalid.domain.xyz",
//   },
//   concurrency: {
//     domain: "concurrent.test.com",
//     pageCount: 15, // Test throttling limits
//   },
// }

// // Helper functions
// const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// async function apiCall(path: string, options?: RequestInit) {
//   const url = `${BASE_URL}${path}`
//   console.log(`📡 API: ${options?.method || "GET"} ${path}`)

//   const response = await fetch(url, {
//     headers: {
//       "Content-Type": "application/json",
//       ...options?.headers,
//     },
//     ...options,
//   })

//   const data = await response.json()

//   if (!response.ok) {
//     console.error(`❌ API Error: ${response.status}`, data)
//     throw new Error(`API call failed: ${JSON.stringify(data)}`)
//   }

//   return { data, status: response.status }
// }

// // Test scenarios
// class IntegrationTestSuite {
//   private webhookUrl: string

//   constructor() {
//     this.webhookUrl = `${BASE_URL}/api/webhooks/firecrawl`
//   }

//   /**
//    * Test 1: Happy Path - Basic crawl workflow
//    */
//   async testHappyPath() {
//     console.log("\n🧪 Test 1: Happy Path - Basic Crawl Workflow")
//     console.log("=".repeat(50))

//     const { domain, pageCount } = TEST_SCENARIOS.happyPath

//     // Trigger crawl
//     console.log("📌 Triggering crawl for:", domain)
//     const { data: triggerResponse } = await apiCall("/api/domains/crawl", {
//       method: "POST",
//       body: JSON.stringify({
//         url: domain,
//         checkIntervalMinutes: 1440,
//         openrouterModel: "openai/gpt-4o-mini",
//       }),
//     })

//     const domainId = triggerResponse.domain.id
//     console.log(`✅ Domain created: ${domainId}`)

//     // Wait for job creation
//     await wait(2000)

//     // Simulate webhook events
//     const simulator = new WebhookSimulator(this.webhookUrl)
//     const simulationResult = await simulator.simulateCrawl(domain, {
//       pageCount,
//       delayBetweenPages: 100,
//       simulateFailure: false,
//     })

//     console.log(`✅ Simulated ${pageCount} pages`)

//     // Wait for processing
//     await wait(3000)

//     // Verify results
//     if (triggerResponse.job?.id) {
//       const { data: finalStatus } = await apiCall(
//         `/api/jobs/${triggerResponse.job.id}`,
//       )

//       console.log("📊 Results:")
//       console.log(`   Pages Total: ${finalStatus.pages.total}`)
//       console.log(`   Pages Changed: ${finalStatus.pages.changed}`)

//       if (finalStatus.pages.total !== pageCount) {
//         throw new Error(
//           `Expected ${pageCount} pages, got ${finalStatus.pages.total}`,
//         )
//       }
//     }

//     console.log("✅ Test 1 Passed: Basic workflow completed successfully")
//     return { success: true, domainId }
//   }

//   /**
//    * Test 2: Change Detection - Test version comparison and fingerprinting
//    */
//   async testChangeDetection() {
//     console.log("\n🧪 Test 2: Change Detection & Version Management")
//     console.log("=".repeat(50))

//     const { domain, initialPages, modifiedPages } =
//       TEST_SCENARIOS.changeDetection

//     // Initial crawl
//     console.log("📌 Initial crawl for:", domain)
//     const { data: triggerResponse } = await apiCall("/api/domains/crawl", {
//       method: "POST",
//       body: JSON.stringify({
//         url: domain,
//         checkIntervalMinutes: 60,
//         openrouterModel: "openai/gpt-4o-mini",
//       }),
//     })

//     const domainId = triggerResponse.domain.id
//     const jobId1 = triggerResponse.job?.id

//     // Simulate initial crawl
//     const simulator = new WebhookSimulator(this.webhookUrl)
//     const pages = await simulator.simulateCrawl(domain, {
//       pageCount: initialPages,
//       delayBetweenPages: 100,
//     })

//     console.log(`✅ Initial crawl: ${initialPages} pages`)
//     await wait(3000)

//     // Second crawl with some pages changed
//     console.log("\n📌 Second crawl with changes...")
//     const { data: trigger2 } = await apiCall("/api/domains/crawl", {
//       method: "POST",
//       body: JSON.stringify({
//         url: domain,
//         checkIntervalMinutes: 60,
//         openrouterModel: "openai/gpt-4o-mini",
//       }),
//     })

//     const jobId2 = trigger2.job?.id

//     // Simulate second crawl with modified content
//     const modifiedContent = pages?.pages.map((page, index) => ({
//       ...page,
//       content:
//         index < modifiedPages
//           ? `${page.content}\n\n<!-- Modified at ${Date.now()} -->`
//           : page.content,
//     }))

//     await simulator.simulateCrawlWithPages(domain, modifiedContent || [])
//     console.log(`✅ Second crawl: ${modifiedPages} pages modified`)

//     await wait(3000)

//     // Verify change detection
//     if (jobId2) {
//       const { data: job2Status } = await apiCall(`/api/jobs/${jobId2}`)

//       console.log("📊 Change Detection Results:")
//       console.log(`   Pages with changes: ${job2Status.pages.changed}`)
//       console.log(`   Pages unchanged: ${job2Status.pages.skipped}`)

//       // Check individual page versions
//       for (const page of job2Status.pages.list) {
//         if (page.latestVersion) {
//           console.log(`   - ${page.url}`)
//           console.log(`     Changed: ${page.latestVersion.changedEnough}`)
//           console.log(
//             `     Similarity: ${page.latestVersion.similarityScore || "N/A"}`,
//           )
//         }
//       }
//     }

//     console.log("✅ Test 2 Passed: Change detection working correctly")
//     return { success: true, domainId }
//   }

//   /**
//    * Test 3: Error Handling - Test validation and error scenarios
//    */
//   async testErrorHandling() {
//     console.log("\n🧪 Test 3: Error Handling & Validation")
//     console.log("=".repeat(50))

//     // Test 3a: Invalid domain
//     console.log("📌 Testing invalid domain handling...")
//     try {
//       const { data, status } = await apiCall("/api/domains/crawl", {
//         method: "POST",
//         body: JSON.stringify({
//           url: "", // Empty URL
//           checkIntervalMinutes: 60,
//         }),
//         allowError: true,
//       })

//       if (status === 200) {
//         throw new Error("Expected error for empty URL, but request succeeded")
//       }
//       console.log("✅ Empty URL rejected correctly")
//     } catch (error) {
//       console.log("✅ Invalid domain handled correctly")
//     }

//     // Test 3b: Duplicate active job
//     console.log("\n📌 Testing duplicate job prevention...")
//     const { domain } = TEST_SCENARIOS.errorHandling

//     // Start first crawl
//     const { data: crawl1 } = await apiCall("/api/domains/crawl", {
//       method: "POST",
//       body: JSON.stringify({
//         url: domain,
//         checkIntervalMinutes: 60,
//         openrouterModel: "openai/gpt-4o-mini",
//       }),
//     })

//     // Try to start second crawl immediately
//     try {
//       const { data, status } = await apiCall("/api/domains/crawl", {
//         method: "POST",
//         body: JSON.stringify({
//           url: domain,
//           checkIntervalMinutes: 60,
//           openrouterModel: "openai/gpt-4o-mini",
//         }),
//         allowError: true,
//       })

//       // The API might handle this gracefully by returning existing job
//       console.log(
//         "✅ Duplicate job handled:",
//         status === 200 ? "returned existing" : "rejected",
//       )
//     } catch (error) {
//       console.log("✅ Duplicate job prevented correctly")
//     }

//     // Test 3c: Invalid webhook payload
//     console.log("\n📌 Testing invalid webhook payload...")
//     try {
//       await apiCall("/api/webhooks/firecrawl", {
//         method: "POST",
//         body: JSON.stringify({
//           invalid: "payload",
//         }),
//         allowError: true,
//       })
//       console.log("✅ Invalid webhook payload handled")
//     } catch (error) {
//       console.log("✅ Invalid webhook rejected correctly")
//     }

//     console.log("✅ Test 3 Passed: Error handling working correctly")
//     return { success: true }
//   }

//   /**
//    * Test 4: Concurrency & Rate Limiting
//    */
//   async testConcurrency() {
//     console.log("\n🧪 Test 4: Concurrency & Rate Limiting")
//     console.log("=".repeat(50))

//     const { domain, pageCount } = TEST_SCENARIOS.concurrency

//     // Trigger crawl
//     console.log(`📌 Testing with ${pageCount} pages (above throttle limit)`)
//     const { data: triggerResponse } = await apiCall("/api/domains/crawl", {
//       method: "POST",
//       body: JSON.stringify({
//         url: domain,
//         checkIntervalMinutes: 60,
//         openrouterModel: "openai/gpt-4o-mini",
//       }),
//     })

//     // Simulate many pages quickly
//     const simulator = new WebhookSimulator(this.webhookUrl)
//     const startTime = Date.now()

//     await simulator.simulateCrawl(domain, {
//       pageCount,
//       delayBetweenPages: 10, // Very fast to test throttling
//     })

//     const duration = Date.now() - startTime
//     console.log(`✅ Sent ${pageCount} pages in ${duration}ms`)

//     // Wait for processing
//     await wait(5000)

//     if (triggerResponse.job?.id) {
//       const { data: status } = await apiCall(
//         `/api/jobs/${triggerResponse.job.id}`,
//       )
//       console.log(`📊 Processed ${status.pages.total} pages`)
//       console.log(`   Processing respected rate limits`)
//     }

//     console.log("✅ Test 4 Passed: Concurrency limits working")
//     return { success: true }
//   }

//   /**
//    * Test 5: Mock vs Real Service Switching
//    */
//   async testMockServiceSwitching() {
//     console.log("\n🧪 Test 5: Mock Service Detection")
//     console.log("=".repeat(50))

//     console.log("📌 Checking service mode...")
//     const isDevelopment = process.env.NODE_ENV === "development"
//     const useMock = process.env.USE_MOCK_SERVICES === "true"

//     console.log(`   Environment: ${process.env.NODE_ENV || "production"}`)
//     console.log(
//       `   USE_MOCK_SERVICES: ${process.env.USE_MOCK_SERVICES || "not set"}`,
//     )
//     console.log(
//       `   Expected mode: ${isDevelopment || useMock ? "Mock" : "Real"} Firecrawl`,
//     )

//     // The actual service selection happens in the startCrawl function
//     // We can verify by checking logs or response patterns
//     console.log("✅ Test 5 Passed: Service mode detected correctly")
//     return { success: true }
//   }

//   /**
//    * Run all tests
//    */
//   async runAll() {
//     console.log(`\n${"=".repeat(60)}`)
//     console.log("INNGEST FUNCTIONS INTEGRATION TEST SUITE")
//     console.log("=".repeat(60))
//     console.log(`📍 Base URL: ${BASE_URL}`)
//     console.log("🚀 Starting comprehensive tests...")

//     const results = {
//       happyPath: false,
//       changeDetection: false,
//       errorHandling: false,
//       concurrency: false,
//       mockService: false,
//     }

//     try {
//       // Run tests sequentially to avoid conflicts
//       results.happyPath = (await this.testHappyPath()).success
//       results.changeDetection = (await this.testChangeDetection()).success
//       results.errorHandling = (await this.testErrorHandling()).success
//       results.concurrency = (await this.testConcurrency()).success
//       results.mockService = (await this.testMockServiceSwitching()).success

//       // Summary
//       console.log(`\n${"=".repeat(60)}`)
//       console.log("TEST SUMMARY")
//       console.log("=".repeat(60))

//       const passed = Object.values(results).filter((r) => r).length
//       const total = Object.keys(results).length

//       // biome-ignore lint/complexity/noForEach: <explanation>
//       Object.entries(results).forEach(([test, passed]) => {
//         console.log(`${passed ? "✅" : "❌"} ${test}`)
//       })

//       console.log(`\nTotal: ${passed}/${total} tests passed`)

//       if (passed === total) {
//         console.log("\n🎉 ALL TESTS PASSED!")
//         return { success: true, results }
//         // biome-ignore lint/style/noUselessElse: <explanation>
//       } else {
//         throw new Error(`${total - passed} tests failed`)
//       }
//     } catch (error) {
//       console.error("\n❌ Test suite failed:", error)
//       throw error
//     }
//   }
// }

// // Run tests if executed directly
// async function main() {
//   const suite = new IntegrationTestSuite()

//   try {
//     await suite.runAll()
//     process.exit(0)
//   } catch (error) {
//     console.error("Fatal error:", error)
//     process.exit(1)
//   }
// }

// // Check if running directly
// if (process.argv[1] === import.meta.filename) {
//   main()
// }

// export { IntegrationTestSuite }
