import puppeteer, { Browser, Page } from "puppeteer";
import { DynamicStructuredTool } from "langchain/tools";
import { z } from "zod";
import { WebAutomationConfig } from "./types";

export function createWebAutomationTool(config: WebAutomationConfig = {}) {
  let browser: Browser | null = null;
  let page: Page | null = null;
  const webConfig = {
    headless: true,
    timeout: 30000,
    viewport: { width: 1920, height: 1080 },
    slowMo: 0,
    devtools: false,
    ...config,
  };

  const ensureBrowser = async (): Promise<void> => {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: webConfig.headless,
        defaultViewport: webConfig.viewport,
        slowMo: webConfig.slowMo,
        devtools: webConfig.devtools,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
        ],
      });
    }

    if (!page) {
      page = await browser.newPage();
      if (webConfig.userAgent) {
        await page.setUserAgent(webConfig.userAgent);
      }
      await page.setViewport(webConfig.viewport!);
    }
  };

  const navigate = async (url: string): Promise<string> => {
    if (!page) throw new Error("Browser not initialized");

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: webConfig.timeout,
    });
    const title = await page.title();
    const currentUrl = page.url();
    return `Successfully navigated to: ${currentUrl} (Title: "${title}")`;
  };

  const click = async (
    selector: string,
    waitForSelector?: string
  ): Promise<string> => {
    if (!page) throw new Error("Browser not initialized");

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, {
        timeout: webConfig.timeout,
      });
    }

    let element = await page.$(selector);

    if (!element) {
      element = await page.evaluateHandle((text: string) => {
        const elements = Array.from(document.querySelectorAll("*"));
        return elements.find(
          (el) =>
            el.textContent?.trim().toLowerCase().includes(text.toLowerCase()) &&
            (el.tagName === "BUTTON" ||
              el.tagName === "A" ||
              el.tagName === "INPUT" ||
              (el as HTMLElement).onclick ||
              el.getAttribute("role") === "button")
        ) as Element;
      }, selector);
    }

    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    await element.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    return `Successfully clicked element: ${selector}`;
  };

  const type = async (
    selector: string,
    text: string,
    waitForSelector?: string
  ): Promise<string> => {
    if (!page) throw new Error("Browser not initialized");

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, {
        timeout: webConfig.timeout,
      });
    }

    await page.waitForSelector(selector, { timeout: webConfig.timeout });
    await page.focus(selector);
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Delete");
    await page.type(selector, text, { delay: 50 });

    return `Successfully typed "${text}" into: ${selector}`;
  };

  const extract = async (
    selector: string,
    extractType: string = "text",
    attributeName?: string
  ): Promise<string> => {
    if (!page) throw new Error("Browser not initialized");

    await page.waitForSelector(selector, { timeout: webConfig.timeout });

    const result = await page.evaluate(
      (sel: string, type: string, attr?: string) => {
        const element = document.querySelector(sel);
        if (!element) return null;

        switch (type) {
          case "text":
            return element.textContent?.trim();
          case "html":
            return element.innerHTML;
          case "attribute":
            return element.getAttribute(attr || "");
          case "all":
            return {
              text: element.textContent?.trim(),
              html: element.innerHTML,
              attributes: Array.from(element.attributes).reduce(
                (acc: Record<string, string>, attr) => {
                  acc[attr.name] = attr.value;
                  return acc;
                },
                {}
              ),
            };
          default:
            return element.textContent?.trim();
        }
      },
      selector,
      extractType,
      attributeName
    );

    if (result === null) {
      return `Element not found: ${selector}`;
    }

    return `Extracted from ${selector}: ${JSON.stringify(result)}`;
  };

  const scroll = async (
    selector?: string,
    direction?: string
  ): Promise<string> => {
    if (!page) throw new Error("Browser not initialized");

    if (selector) {
      await page.waitForSelector(selector, { timeout: webConfig.timeout });
      await page.evaluate((sel: string) => {
        const element = document.querySelector(sel);
        element?.scrollIntoView({ behavior: "smooth" });
      }, selector);
      return `Scrolled to element: ${selector}`;
    } else {
      await page.evaluate((dir: string) => {
        switch (dir) {
          case "up":
            window.scrollBy(0, -500);
            break;
          case "down":
            window.scrollBy(0, 500);
            break;
          case "top":
            window.scrollTo(0, 0);
            break;
          case "bottom":
            window.scrollTo(0, document.body.scrollHeight);
            break;
          default:
            window.scrollBy(0, 500);
        }
      }, direction || "down");
      return `Scrolled ${direction || "down"}`;
    }
  };

  const wait = async (milliseconds: number): Promise<string> => {
    if (!page) throw new Error("Browser not initialized");
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    return `Waited ${milliseconds}ms`;
  };

  const takeScreenshot = async (): Promise<string> => {
    if (!page) throw new Error("Browser not initialized");
    const screenshot = await page.screenshot({
      encoding: "base64",
      fullPage: true,
      type: "png",
    });
    return `Screenshot taken (base64): data:image/png;base64,${screenshot}`;
  };

  const getPageInfo = async (): Promise<string> => {
    if (!page) throw new Error("Browser not initialized");

    const info = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        readyState: document.readyState,
        forms: Array.from(document.forms).map((form) => ({
          action: form.action,
          method: form.method,
          inputs: Array.from(form.elements).map((el) => ({
            name: el.getAttribute("name"),
            type: el.getAttribute("type"),
            tagName: el.tagName.toLowerCase(),
          })),
        })),
        links: Array.from(document.links)
          .slice(0, 10)
          .map((link) => ({
            text: link.textContent?.trim(),
            href: link.href,
          })),
        buttons: Array.from(
          document.querySelectorAll(
            'button, input[type="button"], input[type="submit"]'
          )
        )
          .slice(0, 10)
          .map((btn) => ({
            text: btn.textContent?.trim() || btn.getAttribute("value"),
            type: btn.getAttribute("type"),
            id: btn.id,
            className: btn.className,
          })),
      };
    });

    return `Page Info: ${JSON.stringify(info, null, 2)}`;
  };

  const closeBrowser = async (): Promise<string> => {
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
      return "Browser closed successfully";
    }
    return "Browser was already closed";
  };

  return new DynamicStructuredTool({
    name: "web_automation",
    description:
      "Navigate websites, interact with elements, and extract data using browser automation. Actions: navigate, click, type, extract, scroll, wait, screenshot, get_page_info, close",
    schema: z.object({
      action: z.enum([
        "navigate",
        "click",
        "type",
        "extract",
        "scroll",
        "wait",
        "screenshot",
        "get_page_info",
        "close",
      ]),
      url: z
        .string()
        .optional()
        .describe("URL to navigate to (required for navigate action)"),
      selector: z
        .string()
        .optional()
        .describe(
          'CSS selector or text content to target (e.g., "button", "#submit", "Sign In")'
        ),
      text: z
        .string()
        .optional()
        .describe("Text to type (required for type action)"),
      waitTime: z
        .number()
        .optional()
        .describe("Time to wait in milliseconds (for wait action)"),
      extractType: z
        .enum(["text", "html", "attribute", "all"])
        .optional()
        .describe("Type of content to extract"),
      attributeName: z
        .string()
        .optional()
        .describe(
          'Attribute name to extract (when extractType is "attribute")'
        ),
      waitForSelector: z
        .string()
        .optional()
        .describe("Selector to wait for before performing action"),
      scrollDirection: z
        .enum(["up", "down", "top", "bottom"])
        .optional()
        .describe("Direction to scroll"),
    }),
    func: async (input: any): Promise<string> => {
      try {
        await ensureBrowser();

        switch (input.action) {
          case "navigate":
            if (!input.url)
              throw new Error("URL is required for navigate action");
            return await navigate(input.url);
          case "click":
            if (!input.selector)
              throw new Error("Selector is required for click action");
            return await click(input.selector, input.waitForSelector);
          case "type":
            if (!input.selector || !input.text)
              throw new Error("Selector and text are required for type action");
            return await type(
              input.selector,
              input.text,
              input.waitForSelector
            );
          case "extract":
            if (!input.selector)
              throw new Error("Selector is required for extract action");
            return await extract(
              input.selector,
              input.extractType,
              input.attributeName
            );
          case "scroll":
            return await scroll(input.selector, input.scrollDirection);
          case "wait":
            return await wait(input.waitTime || 1000);
          case "screenshot":
            return await takeScreenshot();
          case "get_page_info":
            return await getPageInfo();
          case "close":
            return await closeBrowser();
          default:
            throw new Error(`Unknown action: ${input.action}`);
        }
      } catch (error: any) {
        return `Error: ${error.message}`;
      }
    },
  });
}
