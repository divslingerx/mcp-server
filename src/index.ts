#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer, { Browser } from "puppeteer";
import { MemoryStore } from "./memory-store.js";

class MultiServer {
  private server: Server;
  private memoryStore: MemoryStore;
  private browser: Browser | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "multi-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.memoryStore = new MemoryStore();
    this.setupToolHandlers();
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  private async setupPuppeteer() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "fetch_web_content",
          description: "Fetch and parse web page content",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "URL of the web page to fetch",
              },
              selector: {
                type: "string",
                description: "CSS selector to extract specific content",
              },
            },
            required: ["url"],
          },
        },
        {
          name: "memory_store",
          description: "Store and retrieve data in memory",
          inputSchema: {
            type: "object",
            properties: {
              operation: {
                type: "string",
                enum: ["set", "get", "delete"],
                description: "Operation to perform",
              },
              key: {
                type: "string",
                description: "Key for the data",
              },
              value: {
                type: "string",
                description: "Value to store (only for set operation)",
              },
            },
            required: ["operation", "key"],
          },
        },
        {
          name: "puppeteer_screenshot",
          description: "Take a screenshot of a webpage",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "URL of the page to screenshot",
              },
              selector: {
                type: "string",
                description: "CSS selector to capture",
              },
            },
            required: ["url"],
          },
        },
      ],
    }));

    // Handle fetch_web_content tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "fetch_web_content":
          return this.handleFetchWebContent(request.params.arguments);
        case "memory_store":
          return this.handleMemoryStore(request.params.arguments);
        case "puppeteer_screenshot":
          return this.handlePuppeteerScreenshot(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleFetchWebContent(args: any) {
    const { url, selector } = args as {
      url: string;
      selector?: string;
    };

    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const content = selector ? $(selector).text() : $("body").text();

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch web content: ${message}`
      );
    }
  }

  private async handleMemoryStore(args: any) {
    const { operation, key, value } = args as {
      operation: string;
      key: string;
      value?: string;
    };

    try {
      switch (operation) {
        case "set":
          if (!value) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Value is required for set operation"
            );
          }
          this.memoryStore.set(key, value);
          return {
            content: [
              {
                type: "text",
                text: `Value stored for key: ${key}`,
              },
            ],
          };
        case "get":
          const result = this.memoryStore.get(key);
          return {
            content: [
              {
                type: "text",
                text: result || "",
              },
            ],
          };
        case "delete":
          this.memoryStore.delete(key);
          return {
            content: [
              {
                type: "text",
                text: `Key deleted: ${key}`,
              },
            ],
          };
        default:
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid operation: ${operation}`
          );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new McpError(
        ErrorCode.InternalError,
        `Memory operation failed: ${message}`
      );
    }
  }

  private async handlePuppeteerScreenshot(args: any) {
    const { url, selector } = args as {
      url: string;
      selector?: string;
    };

    if (!this.browser) {
      await this.setupPuppeteer();
    }

    try {
      const page = await this.browser!.newPage();
      await page.goto(url);

      let element;
      if (selector) {
        element = await page.$(selector);
        if (!element) {
          throw new Error(`Element with selector ${selector} not found`);
        }
      }

      const screenshot = await (element || page).screenshot({
        encoding: "base64",
      });

      await page.close();

      return {
        content: [
          {
            type: "text",
            text: screenshot,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new McpError(
        ErrorCode.InternalError,
        `Puppeteer operation failed: ${message}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Multi-Server MCP running on stdio");
  }
}

const server = new MultiServer();
server.run().catch(console.error);
