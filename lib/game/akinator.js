import axios from "axios";
import {
  Agent
} from "https";
const httpsAgent = new Agent({
  keepAlive: true
});
class Akinator {
  constructor(region = "id") {
    console.log("Akinator class initialized.");
    this.region = region;
    const proxyBaseURL = `https://akinator.jack04309487.workers.dev/https://${this.region}.akinator.com`;
    this.proxyClient = axios.create({
      baseURL: proxyBaseURL,
      httpsAgent: httpsAgent,
      timeout: 3e4
    });
    this.cookieJar = new Map();
    this.session = null;
    this.signature = null;
    this.currentStep = 0;
    this.progression = 0;
    this.setupInterceptors(this.proxyClient);
  }
  parseHTMLData(htmlString) {
    const data = {};
    try {
      const sessionMatch = htmlString.match(/<input[^>]*id=["']session["'][^>]*value=["']([^"']*)["'][^>]*>/i);
      if (sessionMatch && sessionMatch[1]) {
        data.session = sessionMatch[1];
      }
      const signatureMatch = htmlString.match(/<input[^>]*id=["']signature["'][^>]*value=["']([^"']*)["'][^>]*>/i);
      if (signatureMatch && signatureMatch[1]) {
        data.signature = signatureMatch[1];
      }
      const stepMatch = htmlString.match(/<input[^>]*id=["']step["'][^>]*value=["']([^"']*)["'][^>]*>/i);
      if (stepMatch && stepMatch[1]) {
        data.step = stepMatch[1];
      }
      const questionMatch = htmlString.match(/<div[^>]*id=["']question-label["'][^>]*>([^<]*)</i);
      if (questionMatch && questionMatch[1]) {
        data.question = questionMatch[1].trim();
      }
      const akitudeMatch = htmlString.match(/<img[^>]*id=["']akitude["'][^>]*src=["']([^"']*)["'][^>]*>/i);
      if (akitudeMatch && akitudeMatch[1]) {
        data.akitude = akitudeMatch[1];
      }
      data.choices = [];
      const choicePattern = /<div[^>]*class=[^>]*li-game-mobile[^>]*data-index=["'](\d+)["'][^>]*>([^<]*)</g;
      let choiceMatch;
      while ((choiceMatch = choicePattern.exec(htmlString)) !== null) {
        data.choices.push({
          id: choiceMatch[1],
          text: choiceMatch[2].trim()
        });
      }
    } catch (error) {
      console.error("Error parsing HTML data:", error);
    }
    return data;
  }
  parseJSONResponse(responseText) {
    const data = {};
    try {
      if (typeof responseText === "object") {
        return responseText;
      }
      const jsonData = JSON.parse(responseText);
      return jsonData;
    } catch (e) {
      console.log("Using regex fallback for JSON parsing");
      try {
        const completionMatch = responseText.match(/"completion"\s*:\s*"([^"]*)"/);
        if (completionMatch) data.completion = completionMatch[1];
        const stepMatch = responseText.match(/"step"\s*:\s*"?([^",}]*)"?/);
        if (stepMatch) data.step = stepMatch[1];
        const progressionMatch = responseText.match(/"progression"\s*:\s*"?([^",}]*)"?/);
        if (progressionMatch) data.progression = progressionMatch[1];
        const questionMatch = responseText.match(/"question"\s*:\s*"([^"]*)"/);
        if (questionMatch) data.question = questionMatch[1];
        const akitudeMatch = responseText.match(/"akitude"\s*:\s*"([^"]*)"/);
        if (akitudeMatch) data.akitude = akitudeMatch[1];
        const propositionIdMatch = responseText.match(/"id_proposition"\s*:\s*"?([^",}]*)"?/);
        if (propositionIdMatch) data.id_proposition = propositionIdMatch[1];
        const namePropositionMatch = responseText.match(/"name_proposition"\s*:\s*"([^"]*)"/);
        if (namePropositionMatch) data.name_proposition = namePropositionMatch[1];
        const descriptionPropositionMatch = responseText.match(/"description_proposition"\s*:\s*"([^"]*)"/);
        if (descriptionPropositionMatch) data.description_proposition = descriptionPropositionMatch[1];
        const photoMatch = responseText.match(/"photo"\s*:\s*"([^"]*)"/);
        if (photoMatch) data.photo = photoMatch[1];
      } catch (regexError) {
        console.error("Error in regex parsing:", regexError);
      }
      return data;
    }
  }
  setupInterceptors(client) {
    client.interceptors.request.use(config => {
      if (this.cookieJar.size > 0) {
        const cookieString = Array.from(this.cookieJar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
        config.headers.Cookie = cookieString;
      }
      return config;
    });
    client.interceptors.response.use(response => {
      const setCookieHeader = response.headers["set-cookie"];
      if (setCookieHeader) {
        setCookieHeader.forEach(cookieString => {
          const [cookiePair] = cookieString.split(";");
          const [key, value] = cookiePair.split("=");
          if (key && value) {
            this.cookieJar.set(key.trim(), value.trim());
          }
        });
      }
      return response;
    });
  }
  async create() {
    console.log("Starting a new game via proxy...");
    try {
      const createHeaders = {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "id-ID",
        "cache-control": "max-age=0",
        "content-type": "application/x-www-form-urlencoded",
        origin: this.proxyClient.defaults.baseURL,
        priority: "u=0, i",
        referer: `${this.proxyClient.defaults.baseURL}/`,
        "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
      };
      const requestBody = "cm=false&sid=1";
      const gameResponse = await this.proxyClient.post("/game", requestBody, {
        headers: createHeaders
      });
      console.log("Raw response received, parsing with match...");
      const parsedData = this.parseHTMLData(gameResponse.data);
      this.session = parsedData.session || Math.random().toString(36).substr(2, 9);
      this.signature = parsedData.signature || "default-signature";
      this.currentStep = parseInt(parsedData.step || "0", 10);
      this.progression = 0;
      const choices = parsedData.choices.length > 0 ? parsedData.choices : [{
        id: "0",
        text: "Iya"
      }, {
        id: "1",
        text: "Tidak"
      }, {
        id: "2",
        text: "Tidak tahu"
      }, {
        id: "3",
        text: "Mungkin"
      }, {
        id: "4",
        text: "Mungkin tidak"
      }];
      console.log("Game started successfully. Data parsed with match method.");
      return {
        question: parsedData.question || "Apakah karakter Anda seorang manusia?",
        akitude: parsedData.akitude ? `${this.proxyClient.defaults.baseURL}${parsedData.akitude}` : null,
        choices: choices,
        step: this.currentStep,
        progression: this.progression
      };
    } catch (error) {
      console.error("Error starting game:", error.response?.data || error.message);
      throw new Error(`Failed to start the game: ${error.message}`);
    }
  }
  async step({
    answerId
  }) {
    console.log(`Answering with choice ID: ${answerId} using match parsing...`);
    if (this.session === null || this.signature === null) {
      throw new Error("Game has not been started. Call create() first.");
    }
    try {
      const stepHeaders = {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "id-ID",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        origin: this.proxyClient.defaults.baseURL,
        priority: "u=1, i",
        referer: `${this.proxyClient.defaults.baseURL}/game`,
        "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        "x-requested-with": "XMLHttpRequest"
      };
      const requestBody = `step=${this.currentStep}&progression=${this.progression}&sid=1&cm=false&answer=${answerId}&step_last_proposition=&session=${encodeURIComponent(this.session)}&signature=${encodeURIComponent(this.signature)}`;
      const response = await this.proxyClient.post("/answer", requestBody, {
        headers: stepHeaders
      });
      console.log("Raw response received, parsing JSON with match...");
      const data = this.parseJSONResponse(response.data);
      const completionStatus = data.completion || "";
      if (completionStatus.match(/KO/i)) {
        throw new Error("Game returned KO status");
      } else if (completionStatus.match(/SOUNDLIKE/i)) {
        return {
          finished: true,
          soundlike: true,
          ...data
        };
      }
      const isGuess = !!(data.id_proposition || data.name_proposition);
      if (isGuess) {
        console.log("Akinator has a guess!");
        return {
          finished: true,
          ...data
        };
      }
      this.currentStep = parseInt(data.step || this.currentStep + 1, 10);
      this.progression = parseFloat(data.progression || this.progression);
      const choices = [{
        id: "0",
        text: "Iya"
      }, {
        id: "1",
        text: "Tidak"
      }, {
        id: "2",
        text: "Tidak tahu"
      }, {
        id: "3",
        text: "Mungkin"
      }, {
        id: "4",
        text: "Mungkin tidak"
      }];
      console.log(`Received next question. Step: ${this.currentStep}, Progression: ${this.progression}%`);
      return {
        finished: false,
        question: data.question || `Pertanyaan langkah ${this.currentStep}`,
        akitude: data.akitude ? `${this.proxyClient.defaults.baseURL}/assets/img/akitudes_520x650/${data.akitude}` : null,
        step: this.currentStep,
        progression: this.progression,
        choices: choices
      };
    } catch (error) {
      console.error("Error answering question:", error.response?.data || error.message);
      throw new Error(`Failed to submit answer: ${error.message}`);
    }
  }
  async cancelAnswer() {
    console.log("Cancelling answer...");
    if (this.session === null || this.signature === null) {
      throw new Error("Game has not been started. Call create() first.");
    }
    try {
      const requestBody = `step=${this.currentStep}&progression=${this.progression}&sid=1&cm=false&session=${encodeURIComponent(this.session)}&signature=${encodeURIComponent(this.signature)}`;
      const response = await this.proxyClient.post("/cancel_answer", requestBody, {
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest"
        }
      });
      const data = this.parseJSONResponse(response.data);
      this.currentStep = parseInt(data.step || Math.max(0, this.currentStep - 1), 10);
      this.progression = parseFloat(data.progression || this.progression);
      return {
        question: data.question || `Pertanyaan langkah ${this.currentStep}`,
        akitude: data.akitude ? `${this.proxyClient.defaults.baseURL}/assets/img/akitudes_520x650/${data.akitude}` : null,
        step: this.currentStep,
        progression: this.progression,
        choices: [{
          id: "0",
          text: "Iya"
        }, {
          id: "1",
          text: "Tidak"
        }, {
          id: "2",
          text: "Tidak tahu"
        }, {
          id: "3",
          text: "Mungkin"
        }, {
          id: "4",
          text: "Mungkin tidak"
        }]
      };
    } catch (error) {
      console.error("Error cancelling answer:", error.response?.data || error.message);
      throw new Error(`Failed to cancel answer: ${error.message}`);
    }
  }
  async continueGame() {
    console.log("Continuing game after refusing guess...");
    try {
      const requestBody = `step=${this.currentStep}&sid=1&cm=false&progression=${this.progression}&session=${encodeURIComponent(this.session)}&signature=${encodeURIComponent(this.signature)}&forward_answer=1`;
      const response = await this.proxyClient.post("/exclude", requestBody, {
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest"
        }
      });
      const data = this.parseJSONResponse(response.data);
      this.currentStep = parseInt(data.step || this.currentStep + 1, 10);
      this.progression = parseFloat(data.progression || this.progression);
      return {
        question: data.question || `Pertanyaan langkah ${this.currentStep}`,
        akitude: data.akitude ? `${this.proxyClient.defaults.baseURL}/assets/img/akitudes_520x650/${data.akitude}` : null,
        step: this.currentStep,
        progression: this.progression,
        choices: [{
          id: "0",
          text: "Iya"
        }, {
          id: "1",
          text: "Tidak"
        }, {
          id: "2",
          text: "Tidak tahu"
        }, {
          id: "3",
          text: "Mungkin"
        }, {
          id: "4",
          text: "Mungkin tidak"
        }]
      };
    } catch (error) {
      console.error("Error continuing game:", error.response?.data || error.message);
      throw new Error(`Failed to continue game: ${error.message}`);
    }
  }
  reset() {
    this.cookieJar.clear();
    this.session = null;
    this.signature = null;
    this.currentStep = 0;
    this.progression = 0;
    console.log("Game state reset.");
  }
  getState() {
    return {
      session: this.session,
      signature: this.signature,
      step: this.currentStep,
      progression: this.progression,
      region: this.region,
      cookieJar: Object.fromEntries(this.cookieJar)
    };
  }
  setState(state) {
    this.session = state.session;
    this.signature = state.signature;
    this.currentStep = state.step || 0;
    this.progression = state.progression || 0;
    this.region = state.region || "id";
    if (state.cookieJar) {
      this.cookieJar = new Map(Object.entries(state.cookieJar));
    }
    console.log("Game state restored.");
  }
}
export const gameChoices = [{
  id: "0",
  text: "Iya"
}, {
  id: "1",
  text: "Tidak"
}, {
  id: "2",
  text: "Tidak tahu"
}, {
  id: "3",
  text: "Mungkin"
}, {
  id: "4",
  text: "Mungkin tidak"
}];
export const supportedRegions = [{
  code: "id",
  name: "Indonesia"
}, {
  code: "en",
  name: "English"
}, {
  code: "jp",
  name: "Japanese"
}, {
  code: "de",
  name: "German"
}, {
  code: "es",
  name: "Spanish"
}, {
  code: "fr",
  name: "French"
}, {
  code: "it",
  name: "Italian"
}, {
  code: "ru",
  name: "Russian"
}];
export {
  Akinator
};