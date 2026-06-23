import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { loadHoyoApiEnv } from "./loadHoyoApiEnv.js";
import { runHoyoApiExperiment } from "./HoyoApiExperimentClient.js";
import {
  safeCookieSummary,
  serializeHoyolabCookies,
  type BrowserCookie,
  type CookieSerializationSummary,
} from "./serializeCookies.js";
import { writeHoyoApiEnvFile } from "./writeHoyoApiEnv.js";
import { sanitizeHoyoApiOutput } from "./sanitizeHoyoApiOutput.js";

const DEFAULT_LOGIN_URL =
  "https://act.hoyolab.com/app/community-game-records-sea/index.html?bbs_presentation_style=fullscreen&bbs_auth_required=true&gid=2";

interface CaptureCliOptions {
  outEnv: string;
  outJson?: string;
  url: string;
  timeoutSeconds: number;
  runSpike: boolean;
  noWrite: boolean;
  json: boolean;
}

interface CaptureReport {
  envWrite: ReturnType<typeof writeHoyoApiEnvFile>;
  jsonWrite?: {
    written: boolean;
    path: string;
    reason?: string;
  };
  cookieSummary: CookieSerializationSummary;
  spike?: unknown;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await captureHoyolabCookies(options);

  if (options.json) {
    console.log(JSON.stringify(sanitizeHoyoApiOutput(result), null, 2));
    return;
  }

  printCaptureReport(result);
}

export async function captureHoyolabCookies(options: CaptureCliOptions): Promise<CaptureReport> {
  const browser = await chromium.launch({ headless: false });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    console.log("HoYoLAB login page opened. Log in manually in the browser window.");
    await waitForEnterOrTimeout(options.timeoutSeconds);
    const cookies = (await context.cookies()) as BrowserCookie[];
    const serialized = serializeHoyolabCookies(cookies);
    const config = loadHoyoApiEnv();
    const uid = config.uid;
    const envWrite = writeHoyoApiEnvFile(
      options.outEnv,
      {
        cookieString: serialized.cookieString,
        uid,
        lang: config.lang,
      },
      { noWrite: options.noWrite },
    );
    const jsonWrite = writeCookieJson(options.outJson, serialized, options.noWrite);
    const report: CaptureReport = {
      envWrite,
      jsonWrite,
      cookieSummary: safeCookieSummary(serialized),
    };

    if (options.runSpike) {
      report.spike = await runHoyoApiExperiment({ claimDaily: false, yes: false });
    }

    return report;
  } finally {
    await browser.close();
  }
}

function parseArgs(args: string[]): CaptureCliOptions {
  const options: CaptureCliOptions = {
    outEnv: ".env.local",
    url: DEFAULT_LOGIN_URL,
    timeoutSeconds: 300,
    runSpike: false,
    noWrite: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--out-env") {
      options.outEnv = requireValue(args, ++index, arg);
    } else if (arg === "--out-json") {
      options.outJson = requireValue(args, ++index, arg);
    } else if (arg === "--url") {
      options.url = requireValue(args, ++index, arg);
    } else if (arg === "--timeout-seconds") {
      options.timeoutSeconds = Number(requireValue(args, ++index, arg));
    } else if (arg === "--run-spike") {
      options.runSpike = true;
    } else if (arg === "--no-write") {
      options.noWrite = true;
    } else if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];

  if (!value) {
    throw new Error(`${option} requires a value.`);
  }

  return value;
}

async function waitForEnterOrTimeout(timeoutSeconds: number): Promise<void> {
  const readline = createInterface({ input, output });
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutSeconds * 1000);
  });
  const prompt = readline.question("Press Enter here after manual login completes...");

  await Promise.race([prompt.then(() => undefined), timeout]);
  readline.close();
}

function writeCookieJson(
  outJson: string | undefined,
  serialized: ReturnType<typeof serializeHoyolabCookies>,
  noWrite: boolean,
): CaptureReport["jsonWrite"] {
  if (!outJson) {
    return undefined;
  }

  const path = resolve(outJson);

  if (noWrite) {
    return {
      written: false,
      path,
      reason: "--no-write",
    };
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        summary: safeCookieSummary(serialized),
        cookieNames: serialized.selectedCookies.map((cookie) => cookie.name),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    written: true,
    path,
  };
}

function printCaptureReport(report: CaptureReport): void {
  const presence = report.cookieSummary.importantCookieNamesPresent;

  console.log("HoYoLAB cookie capture summary");
  console.log(`total cookies: ${report.cookieSummary.totalCookies}`);
  console.log(`relevant cookies: ${report.cookieSummary.relevantCookies}`);
  console.log(`domains seen: ${report.cookieSummary.domainsSeen.join(", ") || "none"}`);
  console.log(`duplicate names: ${report.cookieSummary.duplicateNames.join(", ") || "none"}`);
  console.log(`ltuid present: ${yesNo(presence.ltuid)}`);
  console.log(`ltoken present: ${yesNo(presence.ltoken)}`);
  console.log(`cookie_token present: ${yesNo(presence.cookie_token)}`);
  console.log(`account_id present: ${yesNo(presence.account_id)}`);
  console.log(`ltuid_v2 present: ${yesNo(presence.ltuid_v2)}`);
  console.log(`ltoken_v2 present: ${yesNo(presence.ltoken_v2)}`);
  console.log(`cookie_token_v2 present: ${yesNo(presence.cookie_token_v2)}`);
  console.log(`account_id_v2 present: ${yesNo(presence.account_id_v2)}`);
  console.log(`DEVICEFP present: ${yesNo(presence.DEVICEFP)}`);
  console.log(`HOYOAPI_COOKIE written: ${yesNo(report.envWrite.written)}`);
  console.log(`output env path: ${report.envWrite.path}`);

  if (report.jsonWrite) {
    console.log(`output json written: ${yesNo(report.jsonWrite.written)}`);
    console.log(`output json path: ${report.jsonWrite.path}`);
  }

  console.log("Next commands:");
  console.log("npm run spike:hoyoapi -- --print-config");
  console.log("npm run spike:hoyoapi -- --out data/raw/hoyoapi/latest.sanitized.json");
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`hoyolab cookie capture failed: ${message}`);
  process.exitCode = 1;
});
