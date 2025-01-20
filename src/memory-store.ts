import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// Import Puppeteer for browser automation
import puppeteer, { Browser } from "puppeteer";

// Define interfaces for search results and arguments
interface SearchResult {
  title: string | null; // Title of the search result
  url: string | undefined; // URL of the search result
}

export class MemoryStore {
  private store: Map<string, string>;
  private server: Server;
  private browser: Browser | null = null; // Puppeteer browser instance

  constructor() {
    this.store = new Map();
    // Initialize MCP server with name and version
    this.server = new Server(
      {
        name: "memory-store", // Unique server name
        version: "0.1.0", // Server version
      },
      {
        capabilities: {
          resources: {}, // No resources exposed
          tools: {}, // Tools will be added in setupToolHandlers
        },
      }
    );

    // Set up tool handlers and error handling
    this.setupToolHandlers();

    // Handle server errors
    this.server.onerror = (error) => console.error("[MCP Error]", error);

    // Clean up on process termination
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // Register available tools with their input schemas
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_web", // Tool name
          description: "Search the web using Google",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query",
              },
            },
            required: ["query"], // Query parameter is mandatory
          },
        },
      ],
    }));

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Validate requested tool name
      if (request.params.name !== "search_web") {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      // Initialize Puppeteer browser if not already running
      if (!this.browser) {
        this.browser = await puppeteer.launch();
      }

      // Create new browser page
      const page = await this.browser.newPage();

      // Validate request arguments
      if (
        !request.params.arguments ||
        typeof request.params.arguments !== "object"
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Invalid arguments provided"
        );
      }

      const args = request.params.arguments;
      if (
        !args ||
        typeof args !== "object" ||
        !("query" in args) ||
        typeof args.query !== "string"
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Query parameter is required and must be a string"
        );
      }

      // Perform Google search using Puppeteer
      await page.goto(
        `https://www.google.com/search?q=${encodeURIComponent(args.query)}`
      );

      // Extract search results from page
      const results = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("h3")).map((el) => ({
          title: el.textContent,
          url: el.closest("a")?.href,
        }));
      });

      // Clean up browser page
      await page.close();

      // Return results as JSON
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Memory Store MCP server running on stdio");
  }

  // Basic memory store operations
  set(key: string, value: string) {
    this.store.set(key, value);
  }

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  delete(key: string) {
    this.store.delete(key);
  }
}

const server = new MemoryStore();
server.run().catch(console.error);
