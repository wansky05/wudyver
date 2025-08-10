import {
  spawn
} from "child_process";
class SafeCodeExecutor {
  constructor() {
    this.supportedLanguages = {
      python: {
        command: "python3",
        args: ["-c"]
      },
      javascript: {
        command: "node",
        args: ["-e"]
      },
      java: {
        command: "java",
        args: ["--source", "11", "-"]
      },
      curl: {
        command: "curl",
        args: []
      }
    };
    this.forbiddenPatterns = {
      general: [/\.\/|\.\\/gi, /\.(env)|(\.pem)|(\.key)/gi, /\/(etc|proc|sys|root)/gi, /(localhost|127\.0\.0\.1|0\.0\.0\.0)/gi, /(192\.168|10|172\.(1[6-9]|2[0-9]|3[0-1]))/gi],
      python: [/import\s+(os|subprocess|sys|shutil|socket|requests)/gi, /open\s*\(/gi, /(file|write|delete|remove|unlink|system|shell|rm|sudo|chmod|chown)/gi],
      javascript: [/(require|import|fs|child_process|os|net|http|https)/gi, /(exec|eval|spawn|fork|rm|sudo|chmod|chown|unlink)/gi],
      curl: [/(file|ftp|gopher|dict|ldap|tftp):\/\//gi, /--(upload-file|output|remote-name|form|data-binary|data-raw|config|netrc|proxy|connect-to|unix-socket)/gi]
    };
  }
  validateCode(code, language) {
    if (!code || typeof code !== "string") {
      throw new Error("Kode tidak valid");
    }
    if (code.length > 5e3) {
      throw new Error("Kode terlalu panjang (maksimal 5000 karakter)");
    }
    for (const pattern of this.forbiddenPatterns.general || []) {
      if (pattern.test(code)) {
        throw new Error("Kode mengandung operasi yang tidak diizinkan");
      }
    }
    for (const pattern of this.forbiddenPatterns[language] || []) {
      if (pattern.test(code)) {
        throw new Error(`Kode mengandung operasi ${language} yang tidak diizinkan`);
      }
    }
    return true;
  }
  validateLanguage(language) {
    if (!language || typeof language !== "string") {
      throw new Error("Bahasa pemrograman tidak valid");
    }
    const normalizedLang = language.toLowerCase().trim();
    if (!this.supportedLanguages[normalizedLang]) {
      throw new Error(`Bahasa '${language}' tidak didukung. Bahasa yang didukung: ${Object.keys(this.supportedLanguages).join(", ")}`);
    }
    return normalizedLang;
  }
  parseCurlCommand(curlCommand) {
    const cleanCommand = curlCommand.replace(/^\s*curl\s+/i, "").trim();
    const args = this.parseCommandArgs(cleanCommand);
    const safeArgs = [];
    let hasUrl = false;
    const securityArgs = ["--max-filesize", "51200", "--connect-timeout", "5", "--max-redirs", "3", "--proto", "=https", "--proto-redir", "=https", "--fail", "--silent", "--show-error"];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (this.isDangerousCurlArg(arg)) {
        if (this.argHasValue(arg) && i + 1 < args.length) {
          i++;
        }
        continue;
      }
      if (arg.match(/^https?:\/\//)) {
        if (this.isValidUrl(arg)) {
          safeArgs.push(arg);
          hasUrl = true;
        } else {
          throw new Error("URL tidak valid atau tidak diizinkan");
        }
      } else {
        safeArgs.push(arg);
      }
    }
    if (!hasUrl) {
      throw new Error("URL HTTPS diperlukan untuk cURL");
    }
    return [...securityArgs, ...safeArgs];
  }
  parseCommandArgs(command) {
    const args = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = "";
      } else if (char === " " && !inQuotes) {
        if (current.trim()) {
          args.push(current.trim());
          current = "";
        }
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      args.push(current.trim());
    }
    return args;
  }
  isDangerousCurlArg(arg) {
    const dangerousArgs = ["--upload-file", "-T", "--output", "-o", "--remote-name", "-O", "--config", "-K", "--netrc", "--netrc-optional", "--netrc-file", "--proxy", "--socks4", "--socks5", "--unix-socket", "--abstract-unix-socket", "--connect-to", "--resolve", "--form", "-F", "--data", "--data-ascii", "--data-binary", "--data-raw", "--data-urlencode", "-d", "--cookie-jar", "--dump-header", "--write-out", "-w"];
    return dangerousArgs.some(dangerous => arg === dangerous || arg.startsWith(dangerous + "="));
  }
  argHasValue(arg) {
    const argsWithValues = ["--output", "-o", "--upload-file", "-T", "--config", "-K", "--proxy", "--data", "-d", "--form", "-F", "--cookie-jar", "--write-out", "-w", "--connect-to", "--resolve"];
    return argsWithValues.includes(arg) && !arg.includes("=");
  }
  isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== "https:") {
        return false;
      }
      const hostname = urlObj.hostname.toLowerCase();
      const forbiddenHostnames = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "::", /^192\.168\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^169\.254\./, /\.local$/, /\.internal$/, /\.intranet$/, /\.corp$/, /\.home$/];
      for (const forbidden of forbiddenHostnames) {
        if (typeof forbidden === "string" && hostname === forbidden) return false;
        if (forbidden instanceof RegExp && forbidden.test(hostname)) return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }
  async executeCode(language, code) {
    const langConfig = this.supportedLanguages[language];
    const {
      command
    } = langConfig;
    let args;
    if (language === "curl") {
      args = this.parseCurlCommand(code);
    } else {
      args = [...langConfig.args, code];
    }
    return new Promise((resolve, reject) => {
      const childProcess = spawn(command, args, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: {},
        cwd: "/tmp"
      });
      let stdout = "";
      let stderr = "";
      childProcess.stdout.on("data", chunk => {
        stdout += chunk.toString();
      });
      childProcess.stderr.on("data", chunk => {
        stderr += chunk.toString();
      });
      childProcess.on("close", exitCode => {
        if (exitCode !== 0) {
          reject(new Error(`Eksekusi gagal (kode: ${exitCode}): ${stderr || "Error tidak diketahui"}`));
        } else {
          resolve({
            stdout: stdout || "Program selesai tanpa output",
            stderr: stderr,
            exitCode: exitCode
          });
        }
      });
      childProcess.on("error", error => {
        reject(new Error(`Gagal menjalankan ${command}: ${error.message}`));
      });
    });
  }
  async runCode(language, code) {
    try {
      const validatedLanguage = this.validateLanguage(language);
      this.validateCode(code, validatedLanguage);
      const result = await this.executeCode(validatedLanguage, code);
      return {
        success: true,
        language: validatedLanguage,
        output: result.stdout,
        error: result.stderr || null,
        exitCode: result.exitCode,
        executionMethod: "local"
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        language: language,
        output: null,
        executionMethod: "local"
      };
    }
  }
}
export default async function handler(req, res) {
  try {
    const params = req.method === "GET" ? req.query : req.body;
    const {
      language,
      code
    } = params;
    if (!language || !code) {
      return res.status(400).json({
        success: false,
        error: 'Payload tidak lengkap. Harap sertakan "language" dan "code".'
      });
    }
    const executor = new SafeCodeExecutor();
    const result = await executor.runCode(language, code);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message
    });
  }
}