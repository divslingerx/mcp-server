#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as cheerio from "cheerio";
class WebContentServer {
    constructor() {
        this.server = new Server({
            name: "web-content-server",
            version: "0.1.0",
        }, {
            capabilities: {
                resources: {},
                tools: {},
            },
        });
        this.setupToolHandlers();
        this.server.onerror = (error) => console.error("[MCP Error]", error);
    }
    setupToolHandlers() {
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
            ],
        }));
        // Handle fetch_web_content tool
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name !== "fetch_web_content") {
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
            const args = request.params.arguments;
            const { url, selector } = args;
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
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error";
                throw new McpError(ErrorCode.InternalError, `Failed to fetch web content: ${message}`);
            }
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Web Content MCP server running on stdio");
    }
}
const server = new WebContentServer();
server.run().catch(console.error);
